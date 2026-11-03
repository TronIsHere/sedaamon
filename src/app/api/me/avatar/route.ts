import { handle, HttpError, requireUser } from "@/server/http";
import { Avatar, User } from "@/server/models";
import { emitUserUpdate } from "@/server/presence";
import { toMe, toUser } from "@/server/serialize";

/** The browser shrinks pictures to a few tens of KB before uploading; anything bigger than this is not one of ours. */
const MAX_BYTES = 512 * 1024;

type ImageType = "image/png" | "image/jpeg" | "image/webp";

/** Trusts the bytes, not the Content-Type header. */
function sniff(bytes: Buffer): ImageType | null {
  if (bytes.length > 12 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The request body is the image itself. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new HttpError(413, "تصویر خیلی بزرگ است");
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new HttpError(413, "تصویر خیلی بزرگ است");
  const contentType = sniff(bytes);
  if (!contentType) throw new HttpError(400, "فقط تصویر PNG، JPEG یا WebP پذیرفته می‌شود");

  await Avatar.updateOne({ user: user._id }, { user: user._id, contentType, data: bytes }, { upsert: true });
  const updated = await User.findByIdAndUpdate(user._id, { avatarAt: new Date() }, { new: true }).lean();
  void emitUserUpdate(toUser(updated!));
  return { user: toMe(updated!) };
});

export const DELETE = handle(async () => {
  const user = await requireUser();
  await Avatar.deleteOne({ user: user._id });
  const updated = await User.findByIdAndUpdate(user._id, { avatarAt: null }, { new: true }).lean();
  void emitUserUpdate(toUser(updated!));
  return { user: toMe(updated!) };
});
