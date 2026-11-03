import { z } from "zod";
import { handle, HttpError, requireUser } from "@/server/http";
import { User } from "@/server/models";
import { emitUserUpdate } from "@/server/presence";
import { toMe, toUser } from "@/server/serialize";

export const GET = handle(async () => ({ user: toMe(await requireUser()) }));

export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = z
    .object({
      name: z.string().optional(),
      bio: z.string().optional(),
      status: z.enum(["available", "busy", "away", "gaming"]).optional(),
      statusText: z.string().optional(),
    })
    .parse(await req.json());
  const update: { name?: string; bio?: string; status?: string; statusText?: string } = {};
  if (body.name !== undefined) {
    const clean = body.name.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 32) throw new HttpError(400, "نام باید بین ۲ تا ۳۲ حرف باشد");
    update.name = clean;
  }
  if (body.bio !== undefined) {
    const bio = body.bio.trim();
    if (bio.length > 190) throw new HttpError(400, "درباره من نباید بیشتر از ۱۹۰ حرف باشد");
    update.bio = bio;
  }
  if (body.status !== undefined) update.status = body.status;
  if (body.statusText !== undefined) {
    const text = body.statusText.trim().replace(/\s+/g, " ");
    if (text.length > 60) throw new HttpError(400, "متن وضعیت نباید بیشتر از ۶۰ حرف باشد");
    update.statusText = text;
  }
  const updated = await User.findByIdAndUpdate(user._id, update, { new: true }).lean();
  void emitUserUpdate(toUser(updated!));
  return { user: toMe(updated!) };
});
