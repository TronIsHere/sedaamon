import sharp from "sharp";
import { PICTURE_SIDE } from "@/lib/image";
import { HttpError } from "./errors";

/** The browser shrinks pictures to a few tens of KB before uploading; anything bigger than this is not one of ours. */
const MAX_BYTES = 512 * 1024;
/** Refuses to decode anything larger, so a tiny file can't unpack into gigabytes of pixels. */
const MAX_INPUT_PIXELS = 4096 * 4096;

type ImageType = "image/png" | "image/jpeg" | "image/webp";

/** Trusts the bytes, not the Content-Type header. */
function sniff(bytes: Buffer): ImageType | null {
  if (bytes.length > 12 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Reads a profile or server picture sent as the request body itself, and re-encodes it as a square WebP of at most
 * 256px. Whatever the client sent (an old app, a script), what gets stored is small and free of metadata.
 */
export async function readImage(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new HttpError(413, "تصویر خیلی بزرگ است");
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new HttpError(413, "تصویر خیلی بزرگ است");
  if (!sniff(bytes)) throw new HttpError(400, "فقط تصویر PNG، JPEG یا WebP پذیرفته می‌شود");

  try {
    const data = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(PICTURE_SIDE, PICTURE_SIDE, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { contentType: "image/webp", data };
  } catch {
    throw new HttpError(400, "این فایل تصویر معتبری نیست");
  }
}

/** Serves a stored picture. Its URL carries the upload time as `?v=`, so it can be cached for good. */
export function imageResponse(image: { contentType: string; data: unknown }) {
  // lean() hands back the driver's Binary wrapper rather than a Buffer; its .buffer holds the bytes.
  const stored = image.data as Buffer | { buffer: Uint8Array };
  const bytes = Buffer.isBuffer(stored) ? stored : Buffer.from(stored.buffer);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
