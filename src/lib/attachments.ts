import { toPersianDigits } from "./phone";
import type { AttachmentDTO } from "./types";

/** The most any one file may weigh once it reaches the server, images after the browser has shrunk them. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Pictures shown in the chat. Anything else (SVG included, which can carry script) is offered as a download. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toPersianDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1).replace(".", "٫"))} مگابایت`;
}

/** «۱:۰۵» for a voice note's length or position. */
export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return toPersianDigits(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`);
}

/** What stands for a message in previews (replies, pins, notifications) when it has no text of its own. */
export function messageSummary(content: string, attachments: readonly Pick<AttachmentDTO, "kind" | "name">[] = []) {
  if (content) return content;
  if (!attachments.length) return "";
  if (attachments[0].kind === "voice") return "🎤 پیام صوتی";
  if (attachments.every((a) => a.kind === "image")) return attachments.length > 1 ? `🖼 ${toPersianDigits(attachments.length)} تصویر` : "🖼 تصویر";
  return attachments.length > 1 ? `📎 ${toPersianDigits(attachments.length)} فایل` : `📎 ${attachments[0].name}`;
}
