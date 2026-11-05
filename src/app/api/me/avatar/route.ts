import { handle, requireUser } from "@/server/http";
import { readImage } from "@/server/images";
import { Avatar, User } from "@/server/models";
import { emitUserUpdate } from "@/server/presence";
import { toMe, toUser } from "@/server/serialize";

/** The request body is the image itself. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const image = await readImage(req);

  await Avatar.updateOne({ user: user._id }, { user: user._id, ...image }, { upsert: true });
  const updated = await User.findByIdAndUpdate(user._id, { avatarAt: new Date() }, { returnDocument: "after" }).lean();
  void emitUserUpdate(toUser(updated!));
  return { user: toMe(updated!) };
});

export const DELETE = handle(async () => {
  const user = await requireUser();
  await Avatar.deleteOne({ user: user._id });
  const updated = await User.findByIdAndUpdate(user._id, { avatarAt: null }, { returnDocument: "after" }).lean();
  void emitUserUpdate(toUser(updated!));
  return { user: toMe(updated!) };
});
