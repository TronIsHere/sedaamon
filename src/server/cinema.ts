import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import type { CinemaDTO, CinemaStateDTO, MovieDTO, SubtitleDTO } from "@/lib/types";
import { channelAudience } from "./access";
import { isAdminPhone } from "./admins";
import { connectDB } from "./db";
import { HttpError } from "./errors";
import { Channel, Movie, User } from "./models";
import { emitToAudience, realtime } from "./realtime";
import { toUser } from "./serialize";
import { getStorage, incomingDir } from "./storage";
import { extractSubtitles, fileSource, parseSubtitleFile, SUBTITLES_VERSION, toVtt, type ByteSource, type SubtitleTrack } from "./subtitles";
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
  key: string;
  repackaged?: boolean | null;
  name: string;
  contentType: string;
  size: number;
  duration: number;
  createdAt?: Date;
  subtitles?: SubtitleDoc[] | null;
};

type SubtitleDoc = { _id?: Types.ObjectId; key: string; lang?: string | null; title?: string | null; forced?: boolean | null; cues?: number | null; uploaded?: boolean | null };

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

/** Tells one file of a film from the next. */
const fileVersion = (key: string) => key.replace(/^.*\//, "").slice(0, 8);

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
    // Browsers keep a film for good, so a new file needs a new address.
    url: `/api/movies/${m._id}?v=${fileVersion(m.key)}`,
    repackaged: !!m.repackaged,
    subtitles: toSubtitles(m),
  }));
}

/** Persian first, whole dialogues before partial ones, files the admin added before the film's own, then the fullest. */
function toSubtitles(m: MovieDoc): SubtitleDTO[] {
  const rank = (s: SubtitleDoc) => (s.lang?.split("-")[0] === "fa" ? 0 : 2) + (s.forced ? 1 : 0);
  return [...(m.subtitles ?? [])]
    .sort((a, b) => rank(a) - rank(b) || Number(!!b.uploaded) - Number(!!a.uploaded) || (b.cues ?? 0) - (a.cues ?? 0))
    .map((s) => ({
      id: String(s._id),
      lang: s.lang || "und",
      title: s.title ?? "",
      forced: !!s.forced,
      uploaded: !!s.uploaded,
      url: `/api/movies/${m._id}/subtitles/${s._id}`,
    }));
}

/** The one library every cinema room plays from. Only the site admin (ADMIN_PHONES) adds and removes films, from /admin. */
const library = async () => toMovies((await Movie.find().sort({ createdAt: -1 }).lean()) as MovieDoc[]);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The library as the admin panel lists it, optionally narrowed to names containing `q`. */
export async function adminLibrary(q: string) {
  const filter = q.trim() ? { name: new RegExp(escapeRegex(q.trim()), "i") } : {};
  const docs = (await Movie.find(filter).sort({ createdAt: -1 }).lean()) as MovieDoc[];
  void readMissingSubtitles();
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
  void readMissingSubtitles();
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
  let tracks: SubtitleTrack[] | null = null;
  try {
    const head = Buffer.alloc(16);
    await handle.read(head, 0, 16, 0);
    contentType = sniffVideo(head);
    if (!contentType) throw new HttpError(400, UNSUPPORTED_FORMAT);
    duration ??= await videoDuration(handle, input.size, contentType);
    // A film is worth having even when its subtitles can't be read.
    tracks = await extractSubtitles(fileSource(handle, input.size), contentType).catch((err) => {
      console.error("[cinema] could not read subtitles of", input.name, err);
      return null;
    });
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
    subtitles: await storeSubtitles(key, tracks ?? []),
    subtitlesVersion: tracks ? SUBTITLES_VERSION : 0,
  });
  await broadcastLibrary();
  return (await toMovies([movie.toObject() as MovieDoc]))[0];
}

/* ---------- Subtitles inside the film ---------- */

async function storeSubtitles(movieKey: string, tracks: SubtitleTrack[]): Promise<SubtitleDoc[]> {
  const out: SubtitleDoc[] = [];
  for (const t of tracks) {
    const key = `${movieKey}.${randomUUID()}.vtt`;
    try {
      await getStorage().put(key, Buffer.from(toVtt(t.cues)), "text/vtt");
    } catch (err) {
      console.error("[cinema] could not store subtitles", err);
      continue;
    }
    out.push({ key, lang: t.lang, title: t.title, forced: t.forced, cues: t.cues.length });
  }
  return out;
}

const storedSource = (key: string, size: number): ByteSource => ({
  size,
  async read(position, length) {
    const end = Math.min(size, position + length) - 1;
    if (end < position) return Buffer.alloc(0);
    const body = await getStorage().stream(key, { start: position, end });
    if (!body) throw new Error(`missing film ${key}`);
    return Buffer.from(await new Response(body).arrayBuffer());
  },
});

/** Reads the subtitles inside a stored film and keeps them beside it. */
async function readSubtitles(film: { _id: Types.ObjectId; key: string; size: number; contentType: string }) {
  const tracks = await extractSubtitles(storedSource(film.key, film.size), film.contentType);
  const subtitles = await storeSubtitles(film.key, tracks);
  // The film's own tracks are replaced; files the admin added stay, even ones added during the scan.
  const before = await Movie.findByIdAndUpdate(film._id, { $pull: { subtitles: { uploaded: { $ne: true } } } }, { returnDocument: "before" }).lean();
  const saved = await Movie.findByIdAndUpdate(film._id, { $push: { subtitles: { $each: subtitles } }, subtitlesVersion: SUBTITLES_VERSION });
  // Replaced ones go, and so do these if the film was deleted meanwhile.
  const stale = (saved ? (before?.subtitles ?? []).filter((s) => !s.uploaded) : subtitles).map((s) => s.key);
  await getStorage().remove(stale).catch(() => {});
  if (saved && subtitles.length) await broadcastLibrary();
}

/** Makes sure a film's own subtitles are out of it, before a file without them takes its place. */
export async function ensureSubtitlesRead(movieId: string) {
  const film = await Movie.findById(movieId, { key: 1, size: 1, contentType: 1, subtitlesVersion: 1 }).lean();
  if (film && (film.subtitlesVersion ?? 0) < SUBTITLES_VERSION) await readSubtitles(film);
}

/**
 * Puts a new file in place of a film's old one, for everyone at once: cinemas showing it load the new file and go on
 * from where they were. False (and the new file gone) when the film was deleted or changed in the meantime.
 */
export async function swapMovieFile(movieId: string, oldKey: string, file: { key: string; contentType: string; size: number }) {
  const saved = await Movie.findOneAndUpdate({ _id: movieId, key: oldKey }, { ...file, repackaged: true });
  await getStorage().remove([saved ? oldKey : file.key]).catch((err) => console.error("[cinema] could not remove", err));
  if (saved) await broadcastLibrary();
  return !!saved;
}

const scan = globalThis as unknown as { __subtitleScan?: { running: boolean; failed: Set<string> } };

/**
 * Reads the subtitles of films that were added before the app could, one at a time in the background.
 * Started whenever someone opens a cinema or the admin panel; there is nothing to do after the first pass.
 */
async function readMissingSubtitles() {
  const state = (scan.__subtitleScan ??= { running: false, failed: new Set() });
  if (state.running) return;
  state.running = true;
  try {
    // $not also matches films with no version at all.
    // A repackaged film has none left inside it: reading it again would only lose the ones already taken out.
    const films = await Movie.find({ subtitlesVersion: { $not: { $gte: SUBTITLES_VERSION } }, repackaged: { $ne: true } }, { key: 1, size: 1, contentType: 1, name: 1 }).lean();
    for (const film of films) {
      const id = String(film._id);
      if (state.failed.has(id)) continue;
      try {
        await readSubtitles(film);
      } catch (err) {
        // Not tried again until the server restarts.
        state.failed.add(id);
        console.error("[cinema] could not read subtitles of", film.name, err);
      }
    }
  } catch (err) {
    console.error("[cinema] subtitle scan failed", err);
  } finally {
    state.running = false;
  }
}

/* ---------- Subtitles added as files ---------- */

const SUBTITLE_MAX_BYTES = 4 * 1024 * 1024;
const MAX_SUBTITLES = 40;

async function readCapped(req: Request, max: number, message: string) {
  if (Number(req.headers.get("content-length") ?? 0) > max) throw new HttpError(413, message);
  const parts: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    for await (const part of Readable.fromWeb(req.body as import("node:stream/web").ReadableStream)) {
      size += part.length;
      if (size > max) throw new HttpError(413, message);
      parts.push(part);
    }
  }
  return Buffer.concat(parts);
}

async function movieDTO(doc: unknown) {
  return (await toMovies([doc as MovieDoc]))[0];
}

/** Adds a subtitle file (the raw request body, its name URI-encoded in `X-Subtitle-Name`) to a film. */
export async function addSubtitle(req: Request, movieId: string) {
  if (!isValidObjectId(movieId)) throw new HttpError(404, "فیلم پیدا نشد");
  const film = await Movie.findById(movieId, { key: 1, subtitles: 1 }).lean();
  if (!film) throw new HttpError(404, "فیلم پیدا نشد");
  if ((film.subtitles?.length ?? 0) >= MAX_SUBTITLES) throw new HttpError(400, "این فیلم زیرنویس‌های زیادی دارد. اول چند تا را حذف کنید");

  let name = req.headers.get("x-subtitle-name") ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {}
  const body = await readCapped(req, SUBTITLE_MAX_BYTES, "حجم فایل زیرنویس نباید بیشتر از ۴ مگابایت باشد");
  // Subtitle sites hand out archives; "PK" starts a zip and "Rar!" a rar.
  if (/^(PK\u0003\u0004|Rar!)/.test(body.toString("latin1", 0, 4))) throw new HttpError(400, "این فایل فشرده است. آن را باز کنید و خود فایل زیرنویس را بفرستید");
  const track = parseSubtitleFile(body, name.split(/[\\/]/).pop() ?? "");
  if (!track) throw new HttpError(400, "در این فایل زیرنویسی پیدا نشد. فایل SRT، VTT یا ASS لازم است");

  const [stored] = await storeSubtitles(film.key, [track]);
  if (!stored) throw new HttpError(500, "زیرنویس ذخیره نشد. دوباره تلاش کنید");
  const movie = await Movie.findByIdAndUpdate(movieId, { $push: { subtitles: { ...stored, uploaded: true } } }, { returnDocument: "after" }).lean();
  if (!movie) {
    await getStorage().remove([stored.key]).catch(() => {});
    throw new HttpError(404, "فیلم پیدا نشد");
  }
  await broadcastLibrary();
  return movieDTO(movie);
}

/** Takes a subtitle off a film, whether it was added as a file or came with it. */
export async function deleteSubtitle(movieId: string, subtitleId: string) {
  if (!isValidObjectId(movieId) || !isValidObjectId(subtitleId)) throw new HttpError(404, "زیرنویس پیدا نشد");
  const before = await Movie.findOneAndUpdate(
    { _id: movieId, "subtitles._id": subtitleId },
    { $pull: { subtitles: { _id: subtitleId } } },
    { returnDocument: "before" },
  ).lean();
  const gone = before?.subtitles?.find((s) => String((s as SubtitleDoc)._id) === subtitleId);
  if (!before || !gone) throw new HttpError(404, "زیرنویس پیدا نشد");
  await getStorage().remove([gone.key]).catch((err) => console.error("[cinema] could not remove", err));
  await broadcastLibrary();
  return movieDTO({ ...before, subtitles: before.subtitles.filter((s) => s !== gone) });
}

/** One of a film's subtitles, as WebVTT. */
export async function streamSubtitle(movieId: string, subtitleId: string) {
  if (!isValidObjectId(movieId) || !isValidObjectId(subtitleId)) throw new HttpError(404, "زیرنویس پیدا نشد");
  const movie = await Movie.findById(movieId, { subtitles: 1 }).lean();
  const subtitle = movie?.subtitles?.find((s) => String((s as SubtitleDoc)._id) === subtitleId);
  const body = subtitle && (await getStorage().get(subtitle.key));
  if (!body) throw new HttpError(404, "زیرنویس پیدا نشد");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
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
  await getStorage().remove([movie.key, ...(movie.subtitles ?? []).map((s) => s.key)]).catch((err) => console.error("[cinema] could not remove", err));
  const showing = (await Channel.find({ type: "cinema", "cinema.movie": movie._id }).lean()) as ChannelDoc[];
  for (const channel of showing) await saveState(channel, { movie: null, playing: false, position: 0, by: null });
  await broadcastLibrary();
}

/** Streams a film for the <video> element, answering the byte ranges it asks for so seeking only fetches what's needed. */
export async function streamMovie(req: Request, movieId: string) {
  if (!isValidObjectId(movieId)) throw new HttpError(404, "فیلم پیدا نشد");
  const movie = await Movie.findById(movieId).lean();
  if (!movie) throw new HttpError(404, "فیلم پیدا نشد");
  // Bytes of two different files must never be mixed in one playback.
  const version = new URL(req.url).searchParams.get("v");
  if (version && version !== fileVersion(movie.key)) throw new HttpError(404, "فایل این فیلم عوض شده است");

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
