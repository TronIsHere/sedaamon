import { randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import { MAX_ATTACHMENTS, MAX_FILE_BYTES } from "@/lib/attachments";
import type { AttachmentDTO } from "@/lib/types";
import { HttpError } from "./errors";
import { Message, Upload } from "./models";
import { getStorage } from "./storage";

/** An unsent upload is kept this long, so a message can be written at leisure after picking the file. */
const PENDING_MS = 24 * 60 * 60_000;

export interface StoredFile {
  id: string;
  key: string;
  kind: "image" | "voice" | "file";
  name: string;
  contentType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  preview?: string | null;
  duration?: number | null;
  waveform?: number[] | null;
}

/** Trusts the bytes, not the Content-Type header: only these are ever shown inline as pictures. */
function sniffImage(bytes: Buffer) {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length > 6 && /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

/** The containers browsers record into: WebM or Ogg holding Opus, or MP4 (Safari). */
function sniffAudio(bytes: Buffer) {
  if (bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) return "audio/webm";
  if (bytes.length > 4 && bytes.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  return null;
}

/** Keeps the name readable but drops folders, control characters and anything absurdly long. */
function cleanName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
}

const dimension = (value: FormDataEntryValue | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
};

/** The browser's stand-in is a few hundred bytes of base64 picture; anything else is ignored. */
const previewOf = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.length <= 2048 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : null;

/** Seconds, as measured by the recording browser. Five megabytes of 16 kbps Opus is far less than an hour. */
const durationOf = (value: FormDataEntryValue | null) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 3600 ? Math.round(n * 10) / 10 : null;
};

/** The loudness bars drawn for a voice note: up to 64 numbers from 0 to 31, comma-separated. */
const waveformOf = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || !/^\d{1,2}(,\d{1,2}){0,63}$/.test(value)) return [];
  return value.split(",").map((n) => Math.min(31, Number(n)));
};

/** Stores one file picked in the composer. It stays pending until a message claims it. */
export async function saveUpload(userId: Types.ObjectId, channelId: string, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "فایلی فرستاده نشد");
  if (!file.size) throw new HttpError(400, "فایل خالی است");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "حجم فایل نباید بیشتر از ۵ مگابایت باشد");

  const bytes = Buffer.from(await file.arrayBuffer());
  // A voice note is asked for by the recorder; a picked audio file stays a plain download.
  const voice = form.get("kind") === "voice";
  const audioType = voice ? sniffAudio(bytes) : null;
  if (voice && !audioType) throw new HttpError(400, "پیام صوتی درست ضبط نشد");
  const imageType = voice ? null : sniffImage(bytes);
  const id = randomUUID();
  const stored: StoredFile = {
    id,
    key: `files/${channelId}/${id}`,
    kind: imageType ? "image" : audioType ? "voice" : "file",
    name: cleanName(file.name),
    // Only a well-formed type is kept; it labels the download and never makes the browser render it.
    contentType: imageType ?? audioType ?? (/^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : "application/octet-stream"),
    size: bytes.length,
  };
  if (audioType) {
    stored.duration = durationOf(form.get("duration"));
    stored.waveform = waveformOf(form.get("waveform"));
  }
  if (imageType) {
    stored.width = dimension(form.get("width"));
    stored.height = dimension(form.get("height"));
    stored.preview = previewOf(form.get("preview"));
  }

  await getStorage().put(stored.key, bytes, stored.contentType);
  await Upload.create({ channel: channelId, uploader: userId, file: stored, expiresAt: new Date(Date.now() + PENDING_MS) });
  return { id };
}

/** Takes this person's pending uploads in this channel for a message being sent, in the order given. */
export async function claimUploads(userId: Types.ObjectId, channelId: string, ids: string[]): Promise<StoredFile[]> {
  if (!ids.length) return [];
  if (ids.length > MAX_ATTACHMENTS) throw new HttpError(400, `هر پیام حداکثر ${MAX_ATTACHMENTS} پیوست دارد`);
  const uploads = await Upload.find({ uploader: userId, channel: channelId, "file.id": { $in: ids } }).lean();
  const byId = new Map(uploads.map((u) => [u.file.id, u.file as StoredFile]));
  const files = [...new Set(ids)].map((id) => byId.get(id));
  if (files.some((f) => !f)) throw new HttpError(400, "بعضی از فایل‌ها پیدا نشدند. دوباره بارگذاری کنید");
  await Upload.deleteMany({ _id: { $in: uploads.map((u) => u._id) } });
  return files as StoredFile[];
}

/** Removes one of this person's pending uploads, when they take it back out of the composer. */
export async function discardUpload(userId: Types.ObjectId, channelId: string, fileId: string) {
  const upload = await Upload.findOneAndDelete({ uploader: userId, channel: channelId, "file.id": fileId }).lean();
  if (upload) await releaseFiles([upload.file.key]);
}

/** Drops uploads that were never sent, and their bytes. */
async function sweepUploads() {
  const stale = await Upload.find({ expiresAt: { $lt: new Date() } }, { file: 1 }).limit(500).lean();
  if (!stale.length) return;
  await Upload.deleteMany({ _id: { $in: stale.map((u) => u._id) } });
  await releaseFiles(stale.map((u) => u.file.key));
}

export function startUploadSweeper() {
  const tick = () => sweepUploads().catch((err) => console.error("[files]", err));
  tick();
  return setInterval(tick, 60 * 60_000);
}

/** Drops stored files that no message (forwarded copies included) and no pending upload points at any more. */
export async function releaseFiles(keys: string[]) {
  const unique = [...new Set(keys)];
  if (!unique.length) return;
  const [inMessages, inUploads] = await Promise.all([
    Message.distinct("attachments.key", { "attachments.key": { $in: unique } }),
    Upload.distinct("file.key", { "file.key": { $in: unique } }),
  ]);
  const used = new Set<string>([...inMessages, ...inUploads].map(String));
  await getStorage()
    .remove(unique.filter((k) => !used.has(k)))
    .catch((err) => console.error("[files] could not remove", err));
}

/** Every stored file of these channels' messages, gathered before the messages themselves are deleted. */
export async function filesOfChannels(channelIds: (string | Types.ObjectId)[]) {
  return (await Message.distinct("attachments.key", { channel: { $in: channelIds }, "attachments.0": { $exists: true } })).map(String);
}

export const toAttachments = (channelId: string, messageId: string, files: StoredFile[] | undefined): AttachmentDTO[] =>
  (files ?? []).map((f) => {
    const dto: AttachmentDTO = {
      id: f.id,
      kind: f.kind,
      name: f.name,
      contentType: f.contentType,
      size: f.size,
      url: `/api/channels/${channelId}/messages/${messageId}/files/${f.id}`,
    };
    if (f.width && f.height) Object.assign(dto, { width: f.width, height: f.height });
    if (f.preview) dto.preview = f.preview;
    if (f.duration) dto.duration = f.duration;
    if (f.waveform?.length) dto.waveform = f.waveform;
    return dto;
  });
