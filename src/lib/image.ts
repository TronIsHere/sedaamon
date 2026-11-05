/** Side of a profile or server picture, in pixels; the server re-encodes to the same size. */
export const PICTURE_SIDE = 256;
/** The biggest file a profile or server picture may be picked from. It never leaves the device at this size. */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
/** Shown next to the picture buttons. */
export const PICTURE_HINT = "حداکثر حجم تصویر: ۱۰ مگابایت";

/** Crops to the centre square and shrinks to 256px, so an avatar upload stays a few tens of KB. */
export async function resizeToAvatar(file: File): Promise<Blob> {
  if (file.size > MAX_PICTURE_BYTES) throw new Error("حجم تصویر نباید بیشتر از ۱۰ مگابایت باشد");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  // Small pictures are not blown up: that only adds bytes.
  const size = Math.min(PICTURE_SIDE, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("مرورگر شما از پردازش تصویر پشتیبانی نمی‌کند");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();

  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
  if (webp?.type === "image/webp") return webp;
  // Safari hands back a PNG when asked for WebP, which would be several times heavier than a JPEG.
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!jpeg) throw new Error("پردازش تصویر ممکن نشد");
  return jpeg;
}

/** Photos bigger than this on either side are scaled down before upload; nobody reads a chat picture at full camera size. */
const MAX_SIDE = 2048;
/** Below this, a picture that already fits is sent untouched. */
const SHRINK_ABOVE = 1024 * 1024;
const PREVIEW_SIDE = 16;

export interface PreparedImage {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  /** A tiny blurred stand-in, shown until the reader taps to load the picture. */
  preview: string;
}

/**
 * Measures a picture, scales large photos down (re-encoded as WebP, or JPEG where the browser can't) and makes its
 * stand-in. GIFs keep their bytes so they stay animated. Returns null for anything the browser can't decode.
 */
export async function prepareImage(file: File): Promise<PreparedImage | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const { width, height } = bitmap;
  try {
    const preview = await encode(bitmap, PREVIEW_SIDE, 0.5).then(blobToDataUrl).catch(() => "");
    const tooBig = Math.max(width, height) > MAX_SIDE || file.size > SHRINK_ABOVE;
    if (file.type === "image/gif" || !tooBig) return { blob: file, name: file.name, width, height, preview };

    const blob = await encode(bitmap, MAX_SIDE, 0.85);
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    // Keep the original if re-encoding somehow made it bigger.
    if (blob.size >= file.size) return { blob: file, name: file.name, width, height, preview };
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return {
      blob,
      name: file.name.replace(/\.[^.]*$/, "") + `.${ext}`,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      preview,
    };
  } finally {
    bitmap.close();
  }
}

async function encode(bitmap: ImageBitmap, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("مرورگر شما از پردازش تصویر پشتیبانی نمی‌کند");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (webp?.type === "image/webp") return webp;
  // Safari hands back a PNG when asked for WebP, which would be far heavier than a JPEG for a photo.
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!jpeg) throw new Error("پردازش تصویر ممکن نشد");
  return jpeg;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
