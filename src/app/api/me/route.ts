import { z } from "zod";
import { handle, HttpError, requireUser } from "@/server/http";
import { User } from "@/server/models";
import { toMe } from "@/server/serialize";

export const GET = handle(async () => ({ user: toMe(await requireUser()) }));

export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const { name } = z.object({ name: z.string() }).parse(await req.json());
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 32) throw new HttpError(400, "نام باید بین ۲ تا ۳۲ حرف باشد");
  const updated = await User.findByIdAndUpdate(user._id, { name: clean }, { new: true }).lean();
  return { user: toMe(updated!) };
});
