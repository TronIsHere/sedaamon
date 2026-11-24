import { toPersianDigits } from "./phone";

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
