import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isValidObjectId } from "mongoose";
import type { MovieRepackageDTO } from "@/lib/types";
import { ensureSubtitlesRead, incomingFile, swapMovieFile } from "./cinema";
import { HttpError } from "./errors";
import { ffmpegAvailable, planRepackage, probeFilm, repackageArgs, repackageProblem, runFfmpeg } from "./ffmpeg";
import { Movie } from "./models";
import { getStorage } from "./storage";

/*
 * The admin presses a button on a film that won't play in Safari and the server repackages it in the background,
 * one film at a time. The original stays in place, and playing, until the new file has been checked; then the two
 * are swapped. Jobs live in memory: a restart drops them, and the film simply stays as it was.
 */

type Job = MovieRepackageDTO & { controller: AbortController };

const store = globalThis as unknown as { __movieRepackage?: { jobs: Map<string, Job>; running: boolean } };
const state = (store.__movieRepackage ??= { jobs: new Map<string, Job>(), running: false });

const isActive = (job: Job) => job.status === "waiting" || job.status === "converting" || job.status === "saving";

export function listRepackages(): MovieRepackageDTO[] {
  return [...state.jobs.values()].map((job) => ({ movieId: job.movieId, name: job.name, status: job.status, percent: job.percent, error: job.error }));
}

export async function startRepackage(movieId: string) {
  if (!isValidObjectId(movieId)) throw new HttpError(404, "فیلم پیدا نشد");
  const movie = await Movie.findById(movieId, { name: 1 }).lean();
  if (!movie) throw new HttpError(404, "فیلم پیدا نشد");
  if (!(await ffmpegAvailable())) throw new HttpError(400, "برنامهٔ ffmpeg روی سرور نصب نیست");
  const existing = state.jobs.get(movieId);
  if (existing && isActive(existing)) throw new HttpError(409, "این فیلم همین حالا در حال آماده‌سازی است");

  state.jobs.delete(movieId);
  state.jobs.set(movieId, { movieId, name: movie.name, status: "waiting", percent: null, error: null, controller: new AbortController() });
  void work();
}

/** Stops a film's repackaging, or clears a finished one from the list. */
export function cancelRepackage(movieId: string) {
  const job = state.jobs.get(movieId);
  if (!job) return;
  // Past this point the swap is already under way and finishes in a moment.
  if (job.status === "saving") throw new HttpError(409, "فیلم آماده شده و در حال ذخیره است");
  job.controller.abort();
  state.jobs.delete(movieId);
}

async function work() {
  if (state.running) return;
  state.running = true;
  try {
    for (;;) {
      const job = [...state.jobs.values()].find((j) => j.status === "waiting");
      if (!job) return;
      await repackage(job);
    }
  } finally {
    state.running = false;
  }
}

async function repackage(job: Job) {
  const signal = job.controller.signal;
  const temps: string[] = [];
  const tempFile = async () => {
    const file = await incomingFile();
    temps.push(file);
    return file;
  };
  job.status = "converting";
  try {
    const film = await Movie.findById(job.movieId).lean();
    if (!film) throw new HttpError(404, "فیلم پیدا نشد");

    let source = getStorage().localPath(film.key);
    const target = await tempFile();
    const disk = await statfs(path.dirname(target));
    // With S3 the original has to come down first, so it takes room for both.
    if (disk.bavail * disk.bsize < film.size * (source ? 1.1 : 2.1)) throw new HttpError(400, "جای خالی روی دیسک سرور کافی نیست");
    if (!source) {
      source = await tempFile();
      const body = await getStorage().stream(film.key);
      if (!body) throw new HttpError(404, "فایل فیلم روی سرور پیدا نشد");
      await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), createWriteStream(source), { signal });
    }

    const plan = planRepackage(await probeFilm(source, film.contentType));
    if (plan.kind === "fine") throw new HttpError(400, "این فیلم همین حالا برای سافاری مناسب است و تغییری لازم ندارد");
    if (plan.kind === "unsupported") {
      throw new HttpError(400, `کدک تصویر این فیلم (⁨${plan.codec.toUpperCase()}⁩) با آماده‌سازی درست نمی‌شود. نسخهٔ H.264 یا x265 آن را اضافه کنید`);
    }
    // The subtitles inside the film don't come along, so they must be out of it first.
    await ensureSubtitlesRead(job.movieId);

    await runFfmpeg(repackageArgs(source, film.contentType, target, plan), signal, (seconds) => {
      job.percent = Math.min(99, Math.floor((seconds / film.duration) * 100));
    });
    const problem = repackageProblem(await probeFilm(target, "video/mp4"), plan, film.duration);
    if (problem) {
      console.error("[cinema] repackaged film rejected", film.name, problem);
      throw new HttpError(500, "فیلم آماده‌شده سالم نبود. فیلم اصلی سر جایش ماند");
    }

    signal.throwIfAborted();
    job.status = "saving";
    const { size } = await stat(target);
    const key = `movies/${randomUUID()}`;
    await getStorage().putFile(key, target, "video/mp4", size);
    if (!(await swapMovieFile(job.movieId, film.key, { key, contentType: "video/mp4", size }))) throw new HttpError(404, "فیلم در این میان حذف شد");
    job.status = "done";
    job.percent = null;
  } catch (err) {
    if (signal.aborted) return;
    job.status = "failed";
    job.percent = null;
    job.error = err instanceof HttpError ? err.message : "آماده‌سازی فیلم ممکن نشد. فیلم اصلی سر جایش ماند";
    if (!(err instanceof HttpError)) console.error("[cinema] repackaging failed", job.name, err);
  } finally {
    await Promise.all(temps.map((file) => rm(file, { force: true })));
  }
}
