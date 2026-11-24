import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import type { CinemaDTO, CinemaStateDTO, MovieDTO } from "@/lib/types";
import { channelAudience } from "./access";
import { isAdminPhone } from "./admins";
import { connectDB } from "./db";
import { HttpError } from "./errors";
import { Channel, Movie, User } from "./models";
import { emitToAudience, realtime } from "./realtime";
import { toUser } from "./serialize";
import { getStorage, incomingDir } from "./storage";
import { videoDuration } from "./videoMeta";

/** The largest film accepted, in bytes. MOVIE_MAX_MB raises or lowers it; S3 caps a single upload at 5 GB. */
export const movieMaxBytes = () => Math.min(5 * 1024, Math.max(1, Number(process.env.MOVIE_MAX_MB) || 4096)) * 1024 * 1024;
/** Keeps the library to a size a person can still scroll through. */
export const MAX_MOVIES = 500;

type ChannelDoc = {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  type: string;
  isPrivate?: boolean | null;
  allowedRoles?: string[] | null;
  allowedMembers?: Types.ObjectId[] | null;
  cinema?: { movie?: Types.ObjectId | null; playing?: boolean | null; position?: number | null; updatedAt?: Date | null; by?: string | null } | null;
};

type MovieDoc = {
  _id: Types.ObjectId;
  uploader?: Types.ObjectId | null;
  name: string;
  contentType: string;
  size: number;
  duration: number;
  createdAt?: Date;
};

export function assertCinema(channel: { type: string }) {
  if (channel.type !== "cinema") throw new HttpError(400, "این کانال سینما نیست");
}

export const stateOf = (channel: ChannelDoc): CinemaStateDTO => {
  const c = channel.cinema;
  return {
    movieId: c?.movie ? String(c.movie) : null,
    playing: !!c?.movie && !!c.playing,
    position: c?.position ?? 0,
    updatedAt: (c?.updatedAt ?? new Date(0)).getTime(),
    by: c?.by ?? null,
  };
};

/** Where the film is right now, in seconds. */
const positionNow = (s: CinemaStateDTO) => (s.playing ? s.position + (Date.now() - s.updatedAt) / 1000 : s.position);

async function toMovies(docs: MovieDoc[]): Promise<MovieDTO[]> {
  const ids = [...new Set(docs.flatMap((m) => (m.uploader ? [String(m.uploader)] : [])))];
  const users = new Map((await User.find({ _id: { $in: ids } }).lean()).map((u) => [String(u._id), toUser(u)]));
  return docs.map((m) => ({
    id: String(m._id),
    name: m.name,
    size: m.size,
    duration: m.duration,
    contentType: m.contentType,
    uploadedBy: (m.uploader && users.get(String(m.uploader))) || null,
    createdAt: (m.createdAt ?? new Date()).toISOString(),
    url: `/api/movies/${m._id}`,
  }));
}

/** The one library every cinema room plays from. Only the site admin (ADMIN_PHONES) adds and removes films, from /admin. */
const library = async () => toMovies((await Movie.find().sort({ createdAt: -1 }).lean()) as MovieDoc[]);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The library as the admin panel lists it, optionally narrowed to names containing `q`. */
export async function adminLibrary(q: string) {
  const filter = q.trim() ? { name: new RegExp(escapeRegex(q.trim()), "i") } : {};
  const docs = (await Movie.find(filter).sort({ createdAt: -1 }).lean()) as MovieDoc[];
  return { movies: await toMovies(docs), maxBytes: movieMaxBytes() };
}

export async function renameMovie(movieId: string, raw: string) {
  if (!isValidObjectId(movieId)) throw new HttpError(404, "فیلم پیدا نشد");
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (name.length < 1 || name.length > 120) throw new HttpError(400, "نام فیلم باید بین ۱ تا ۱۲۰ حرف باشد");
  const movie = await Movie.findByIdAndUpdate(movieId, { name }, { returnDocument: "after" }).lean();
  if (!movie) throw new HttpError(404, "فیلم پیدا نشد");
  await broadcastLibrary();
  return (await toMovies([movie as MovieDoc]))[0];
}

export const canManageLibrary = (user: { phone: string }) => isAdminPhone(user.phone);

export async function cinemaSnapshot(channel: ChannelDoc, user: { phone: string }): Promise<CinemaDTO> {
  return {
    movies: await library(),
    state: stateOf(channel),
    serverNow: Date.now(),
    canManage: canManageLibrary(user),
  };
}

/** The library changed: everyone gets the new list, since every cinema shows the same one. */
async function broadcastLibrary() {
  realtime.io?.emit("cinema:library", { movies: await library() });
}

async function broadcastState(channel: ChannelDoc, state: CinemaStateDTO) {
  const audience = await channelAudience(channel);
  emitToAudience(String(channel.server), audience, "cinema:state", { channelId: String(channel._id), serverNow: Date.now(), state });
}

async function saveState(channel: ChannelDoc, next: { movie: Types.ObjectId | string | null; playing: boolean; position: number; by: string | null }) {
  const cinema = { ...next, updatedAt: new Date() };
  const after = await Channel.findByIdAndUpdate(channel._id, { cinema }, { returnDocument: "after" }).lean();
  if (!after) throw new HttpError(404, "کانال پیدا نشد");
  const state = stateOf(after as ChannelDoc);
  await broadcastState(after as ChannelDoc, state);
  return state;
}

export const controlInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select"), movieId: z.string() }),
  z.object({ action: z.literal("play"), position: z.number().min(0).max(1e6) }),
  z.object({ action: z.literal("pause"), position: z.number().min(0).max(1e6) }),
  z.object({ action: z.literal("seek"), position: z.number().min(0).max(1e6) }),
  z.object({ action: z.literal("stop") }),
]);

/** Anyone in the room can pick a film, play, pause and seek; everyone follows the latest change. */
export async function controlCinema(channel: ChannelDoc, by: string, input: z.infer<typeof controlInput>) {
  const current = stateOf(channel);
  if (input.action === "stop") return saveState(channel, { movie: null, playing: false, position: 0, by });
  if (input.action === "select") {
    if (!isValidObjectId(input.movieId) || !(await Movie.exists({ _id: input.movieId }))) {
      throw new HttpError(404, "این فیلم در کتابخانه نیست");
    }
    return saveState(channel, { movie: input.movieId, playing: false, position: 0, by });
  }
  if (!current.movieId) throw new HttpError(400, "اول یک فیلم انتخاب کنید");
  const movie = await Movie.findById(current.movieId, { duration: 1 }).lean();
  if (!movie) return saveState(channel, { movie: null, playing: false, position: 0, by });
  const position = Math.min(input.position, movie.duration);
  const playing = input.action === "play" ? position < movie.duration : input.action === "pause" ? false : current.playing;
  return saveState(channel, { movie: current.movieId, playing, position, by });
}

/** Holds the film where it is once the last person leaves, so the next to come in doesn't land at the end credits. */
export async function pauseCinemaIfEmpty(channelId: string) {
  if (realtime.voice.get(channelId)?.size) return;
  await connectDB();
  const channel = (await Channel.findById(channelId).lean()) as ChannelDoc | null;
  if (!channel || channel.type !== "cinema") return;
  const state = stateOf(channel);
  if (!state.playing || !state.movieId) return;
  await saveState(channel, { movie: state.movieId, playing: false, position: positionNow(state), by: null });
}

/** The containers browsers play: MP4 / MOV (ISO base media) and WebM / Matroska. */
export function sniffVideo(head: Buffer) {
  if (head.length >= 12 && head.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
  return null;
}

export function cleanName(raw: string) {
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {}
  name = (name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  // The extension says nothing to people choosing a film.
  name = name.replace(/\.(mp4|m4v|mov|webm|mkv)$/i, "").replace(/[._]+/g, " ").trim();
  return name.slice(0, 120) || "فیلم بی‌نام";
}

export const UNSUPPORTED_FORMAT = "این قالب پشتیبانی نمی‌شود. فایل MP4 یا WebM لازم است";

export function tooBigMessage() {
  const max = movieMaxBytes();
  return `حجم فیلم نباید بیشتر از ${(max / 1024 ** 3).toFixed(max % 1024 ** 3 ? 1 : 0)} گیگابایت باشد`;
}

export async function assertLibraryHasRoom() {
  if ((await Movie.countDocuments()) >= MAX_MOVIES) {
    throw new HttpError(400, `کتابخانه حداکثر ${MAX_MOVIES} فیلم دارد. اول چند فیلم را حذف کنید`);
  }
}

/** A fresh path in the folder films wait in until they are checked and stored. */
export async function incomingFile() {
  const dir = incomingDir();
  await mkdir(dir, { recursive: true });
  return path.join(dir, randomUUID());
}

/**
 * Checks a fully received film sitting at `temp`, moves it into storage and adds it to the library.
 * `duration` is the length the uploader's browser measured; without one (a film the server downloaded)
 * it is read from the file. The caller removes `temp` afterwards; storing it may have moved it already.
 */
export async function finalizeMovie(input: { temp: string; size: number; name: string; duration: number | null; uploader: Types.ObjectId }) {
  const handle = await open(input.temp, "r");
  let contentType: string | null;
  let duration = input.duration;
  try {
    const head = Buffer.alloc(16);
    await handle.read(head, 0, 16, 0);
    contentType = sniffVideo(head);
    if (!contentType) throw new HttpError(400, UNSUPPORTED_FORMAT);
    duration ??= await videoDuration(handle, input.size, contentType);
  } finally {
    await handle.close();
  }
  if (!duration || !Number.isFinite(duration) || duration < 1 || duration > 24 * 3600) {
    throw new HttpError(400, "مدت فیلم از فایل خوانده نشد. فایل MP4 یا WebM سالم لازم است");
  }
  await assertLibraryHasRoom();

  const key = `movies/${randomUUID()}`;
  await getStorage().putFile(key, input.temp, contentType, input.size);
  const movie = await Movie.create({
    uploader: input.uploader,
    key,
    name: input.name,
    contentType,
    size: input.size,
    duration: Math.round(duration * 10) / 10,
  });
  await broadcastLibrary();
  return (await toMovies([movie.toObject() as MovieDoc]))[0];
}

/**
 * Takes a film sent as the raw request body (not a form, so it streams straight to disk instead of memory),
 * with its name in `X-Movie-Name` (URI-encoded) and length in `X-Movie-Duration` (seconds, as the uploader's
 * browser measured it; that the browser could measure it at all means it can play it).
 */
export async function receiveMovie(req: Request, uploader: Types.ObjectId) {
  const max = movieMaxBytes();
  if (Number(req.headers.get("content-length") ?? 0) > max) throw new HttpError(413, tooBigMessage());
  const header = req.headers.get("x-movie-duration");
  const measured = header ? Number(header) : null;
  if (measured !== null && (!Number.isFinite(measured) || measured < 1 || measured > 24 * 3600)) {
    throw new HttpError(400, "مدت فیلم خوانده نشد. فایل MP4 یا WebM انتخاب کنید");
  }
  await assertLibraryHasRoom();
  if (!req.body) throw new HttpError(400, "فایلی فرستاده نشد");

  const temp = await incomingFile();
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      done(size > max ? new HttpError(413, tooBigMessage()) : null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), limit, createWriteStream(temp));
    if (!size) throw new HttpError(400, "فایل خالی است");
    const movie = await finalizeMovie({ temp, size, name: cleanName(req.headers.get("x-movie-name") ?? ""), duration: measured, uploader });
    return { movie };
  } catch (err) {
    // Closing the tab mid-upload ends up here too.
    if (err instanceof HttpError) throw err;
    if ((err as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE" || (err as Error).name === "AbortError") {
      throw new HttpError(400, "ارسال فیلم نیمه‌کاره ماند");
    }
    throw err;
  } finally {
    await rm(temp, { force: true });
  }
}

/** Takes a film out of the library, and off the screen of every cinema that was showing it. */
export async function deleteMovie(movieId: string) {
  if (!isValidObjectId(movieId)) throw new HttpError(404, "فیلم پیدا نشد");
  const movie = await Movie.findByIdAndDelete(movieId).lean();
  if (!movie) throw new HttpError(404, "فیلم پیدا نشد");
  await getStorage().remove([movie.key]).catch((err) => console.error("[cinema] could not remove", err));
  const showing = (await Channel.find({ type: "cinema", "cinema.movie": movie._id }).lean()) as ChannelDoc[];
  for (const channel of showing) await saveState(channel, { movie: null, playing: false, position: 0, by: null });
  await broadcastLibrary();
}

/** Streams a film for the <video> element, answering the byte ranges it asks for so seeking only fetches what's needed. */
export async function streamMovie(req: Request, movieId: string) {
  if (!isValidObjectId(movieId)) throw new HttpError(404, "فیلم پیدا نشد");
  const movie = await Movie.findById(movieId).lean();
  if (!movie) throw new HttpError(404, "فیلم پیدا نشد");

  const size = movie.size;
  const headers: Record<string, string> = {
    "Content-Type": movie.contentType,
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };

  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (match && (match[1] || match[2])) {
    // "bytes=-N" asks for the last N bytes.
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    const body = await getStorage().stream(movie.key, { start, end });
    if (!body) throw new HttpError(404, "فیلم پیدا نشد");
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = await getStorage().stream(movie.key);
  if (!body) throw new HttpError(404, "فیلم پیدا نشد");
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
