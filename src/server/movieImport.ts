import { randomUUID } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { createWriteStream } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Types } from "mongoose";
import { toPersianDigits } from "@/lib/phone";
import type { MovieImportDTO } from "@/lib/types";
import {
  assertLibraryHasRoom,
  cleanName,
  finalizeMovie,
  incomingFile,
  movieMaxBytes,
  sniffVideo,
  tooBigMessage,
} from "./cinema";
import { HttpError } from "./errors";
import { incomingDir } from "./storage";

/*
 * The admin pastes a link to a film and the server fetches it itself, so a film already online never has
 * to pass through the admin's own (often slower) connection. Downloads run in the background; the admin
 * panel polls the list for progress. Jobs live in memory: a restart drops the ones still running.
 *
 * The server fetching a URL someone typed is the classic way to reach things only the server can see, so
 * every address the link (or a redirect) resolves to is checked against private and local ranges first.
 */

const MAX_ACTIVE = 3;
const MAX_KEPT = 30;
const MAX_REDIRECTS = 5;
/** No bytes for this long and the download is given up. */
const IDLE_MS = 60_000;

type Job = MovieImportDTO & { controller: AbortController };

const store = globalThis as unknown as { __movieImports?: Map<string, Job> };
const jobs = (store.__movieImports ??= new Map<string, Job>());

function toDTO(job: Job): MovieImportDTO {
  const { controller, ...dto } = job;
  void controller;
  return dto;
}

export function listImports(): MovieImportDTO[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toDTO);
}

const isActive = (job: Job) => job.status === "downloading" || job.status === "processing";

/** Stops a running download, or clears a finished one from the list. */
export function cancelImport(id: string) {
  const job = jobs.get(id);
  if (!job) throw new HttpError(404, "پیدا نشد");
  if (job.status === "processing") throw new HttpError(409, "فیلم دانلود شده و در حال ذخیره است");
  if (job.status === "downloading") {
    job.status = "canceled";
    job.controller.abort();
  } else {
    jobs.delete(id);
  }
}

/* ---------- Where the server may connect ---------- */

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net4, prefix, "ipv4");
}
for (const [net6, prefix] of [["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  blocked.addSubnet(net6, prefix, "ipv6");
}

/** Whether an address is somewhere only the server itself can reach (its own machine, the LAN, the cloud metadata service). */
export function isPrivateAddress(address: string) {
  const family = net.isIP(address);
  if (!family) return true;
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is still that IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

const allowPrivate = () => process.env.MOVIE_IMPORT_ALLOW_PRIVATE === "true";

const NOT_PUBLIC = "این لینک به یک آدرس داخلی می‌رسد و دانلود نمی‌شود";

/** dns.lookup, refusing names that resolve to a private address. Checked at connect time, so a name can't switch after a first check. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "", 4);
    if (!allowPrivate() && addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(NOT_PUBLIC), { code: "EPRIVATE" }), "", 4);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

export function parseLink(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "لینک درست نیست");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "فقط لینک‌های http و https دانلود می‌شوند");
  if (url.username || url.password) throw new HttpError(400, "لینک نباید نام کاربری یا رمز داشته باشد");
  // A bare IP never goes through the lookup above, so it is checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate() && (net.isIP(host) ? isPrivateAddress(host) : host === "localhost" || host.endsWith(".localhost"))) {
    throw new HttpError(400, NOT_PUBLIC);
  }
  return url;
}

/** Opens the link, following up to a few redirects, each checked like the first. */
async function open(url: URL, signal: AbortSignal, hops = 0): Promise<http.IncomingMessage> {
  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(url, {
      lookup: safeLookup,
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SedamoonCinema/1.0)", Accept: "video/*,*/*;q=0.5" },
    });
    req.setTimeout(IDLE_MS, () => req.destroy(new HttpError(400, "سرور فیلم جواب نداد")));
    req.once("response", resolve);
    req.once("error", reject);
  });
  const status = res.statusCode ?? 0;
  if (status >= 300 && status < 400 && res.headers.location) {
    res.resume();
    if (hops >= MAX_REDIRECTS) throw new HttpError(400, "لینک بیش از حد به جای دیگری فرستاده شد");
    return open(parseLink(new URL(res.headers.location, url).href), signal, hops + 1);
  }
  if (status < 200 || status >= 300) {
    res.resume();
    throw new HttpError(400, `سرور فیلم خطای ${toPersianDigits(String(status))} داد`);
  }
  return res;
}

/** The file name the other server gave, from Content-Disposition, if any. */
function dispositionName(header: string | undefined) {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) return star[1].trim();
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Leftovers from downloads a restart cut short. */
async function sweepIncoming() {
  const dir = incomingDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const old = Date.now() - 24 * 3600 * 1000;
  for (const name of names) {
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (info && info.mtimeMs < old) await rm(file, { force: true });
  }
}

function prune() {
  const done = [...jobs.values()].filter((j) => !isActive(j)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  while (jobs.size > MAX_KEPT && done.length) jobs.delete(done.shift()!.id);
}

/** Starts fetching a film from `raw`. Returns at once; progress shows in listImports(). */
export async function startImport(raw: string, givenName: string | null, uploader: Types.ObjectId) {
  const url = parseLink(raw);
  if ([...jobs.values()].filter(isActive).length >= MAX_ACTIVE) {
    throw new HttpError(429, "هم‌زمان حداکثر سه فیلم دانلود می‌شود. صبر کنید یکی تمام شود");
  }
  await assertLibraryHasRoom();

  const job: Job = {
    id: randomUUID(),
    url: url.href,
    name: givenName?.trim() ? cleanName(givenName) : null,
    status: "downloading",
    received: 0,
    total: null,
    error: null,
    createdAt: new Date().toISOString(),
    controller: new AbortController(),
  };
  jobs.set(job.id, job);
  prune();
  void run(job, url, uploader);
  void sweepIncoming().catch(() => {});
  return toDTO(job);
}

async function run(job: Job, url: URL, uploader: Types.ObjectId) {
  const temp = await incomingFile();
  const max = movieMaxBytes();
  try {
    const res = await open(url, job.controller.signal);
    const length = Number(res.headers["content-length"]);
    if (Number.isFinite(length) && length > 0) {
      if (length > max) {
        res.destroy();
        throw new HttpError(413, tooBigMessage());
      }
      job.total = length;
    }
    job.name ??= cleanName(dispositionName(res.headers["content-disposition"]) ?? decodeURIComponent(url.pathname.split("/").pop() ?? ""));

    // Look at the first bytes as they arrive, so a link to a web page fails in a moment, not after downloading it.
    let head: Buffer | null = Buffer.alloc(0);
    const check = new Transform({
      transform(chunk: Buffer, _enc, done) {
        job.received += chunk.length;
        if (job.received > max) return done(new HttpError(413, tooBigMessage()));
        if (head) {
          head = Buffer.concat([head, chunk]);
          if (head.length >= 16) {
            if (!sniffVideo(head)) return done(new HttpError(400, "این لینک مستقیم به فایل ویدیو نیست. لینک باید به خود فایل MP4 یا WebM باشد"));
            head = null;
          }
        }
        done(null, chunk);
      },
    });
    res.setTimeout(IDLE_MS, () => res.destroy(new HttpError(400, "دانلود متوقف ماند")));
    await pipeline(res, check, createWriteStream(temp), { signal: job.controller.signal });
    if (!job.received) throw new HttpError(400, "فایل خالی است");
    if (job.total && job.received < job.total) throw new HttpError(400, "دانلود نیمه‌کاره ماند");

    job.status = "processing";
    await finalizeMovie({ temp, size: job.received, name: job.name ?? "فیلم بی‌نام", duration: null, uploader });
    job.status = "done";
  } catch (err) {
    if (job.status === "canceled") return;
    job.status = "failed";
    const code = (err as NodeJS.ErrnoException).code;
    job.error =
      err instanceof HttpError
        ? err.message
        : code === "EPRIVATE"
          ? NOT_PUBLIC
          : code === "ENOTFOUND" || code === "EAI_AGAIN"
            ? "آدرس این لینک پیدا نشد"
            : code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT"
              ? "به سرور فیلم وصل نشد"
              : code?.startsWith("ERR_TLS") || code?.includes("CERT")
                ? "گواهی امنیتی سرور فیلم معتبر نیست"
                : "دانلود نشد";
    if (!(err instanceof HttpError)) console.error("[cinema] import failed", url.href, err);
  } finally {
    await rm(temp, { force: true });
  }
}
