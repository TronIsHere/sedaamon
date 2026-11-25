import { toPersianDigits } from "./phone";
import type { SubtitleDTO } from "./types";

/** A film position or length as 1:23:45 (or 23:45), in Persian digits. */
export function filmClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, "0");
  return toPersianDigits(h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`);
}

export const sizeLabel = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${toPersianDigits((bytes / 1024 ** 3).toFixed(1))} گیگابایت`
    : `${toPersianDigits(Math.max(1, Math.round(bytes / 1024 ** 2)))} مگابایت`;

const languages = new Intl.DisplayNames(["fa"], { type: "language", fallback: "none" });

function languageName(lang: string) {
  if (lang === "und") return null;
  try {
    return languages.of(lang) ?? null;
  } catch {
    return null;
  }
}

/** What to call each subtitle track: its language, plus something to tell apart two in the same language. */
export function subtitleLabels(tracks: SubtitleDTO[]): string[] {
  const names = tracks.map((t) => languageName(t.lang) ?? (t.title || "زیرنویس"));
  return tracks.map((t, i) => {
    const twins = names.filter((n) => n === names[i]).length > 1;
    const note = t.forced ? "فقط بخش‌های خارجی" : twins ? (t.title && t.title !== names[i] ? t.title : toPersianDigits(names.slice(0, i + 1).filter((n) => n === names[i]).length)) : "";
    return note ? `${names[i]} (${note})` : names[i];
  });
}

/** Whether a film's subtitles start out shown: a Persian one does, others wait to be picked. */
export const defaultSubtitle = (tracks: SubtitleDTO[]) => tracks.find((t) => t.lang.split("-")[0] === "fa" && !t.forced) ?? null;

/** Reads the film's length the way the <video> element will, which also proves this browser can play it. */
export function probeDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      done();
      if (Number.isFinite(video.duration) && video.duration > 0) resolve(video.duration);
      else reject(new Error("unknown length"));
    };
    video.onerror = () => {
      done();
      reject(new Error("unsupported"));
    };
    video.src = url;
  });
}

export const FILM_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov,.mkv";
