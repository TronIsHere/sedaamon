const SIZE = 256;

/** Crops to the centre square and shrinks to 256px, so an avatar upload stays a few tens of KB. */
export async function resizeToAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("مرورگر شما از پردازش تصویر پشتیبانی نمی‌کند");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  // Browsers without WebP encoding hand back a PNG, which is fine at this size.
  if (!blob) throw new Error("پردازش تصویر ممکن نشد");
  return blob;
}
