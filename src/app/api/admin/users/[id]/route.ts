import { z } from "zod";
import { deleteUser, getAdminUser, signOutUser } from "@/server/admin";
import { assertId, handle, HttpError, requireAdmin } from "@/server/http";
import { User } from "@/server/models";
import { emitUserUpdate } from "@/server/presence";
import { toUser } from "@/server/serialize";

type Ctx = RouteContext<"/api/admin/users/[id]">;

/** Edit someone's name or bio, or sign them out everywhere. */
export const PATCH = handle(async (req, ctx: Ctx) => {
  await requireAdmin();
  const id = assertId((await ctx.params).id);
  const body = z
    .object({ name: z.string().optional(), bio: z.string().optional(), signOut: z.literal(true).optional() })
    .parse(await req.json());

  const update: { name?: string; bio?: string } = {};
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
  if (Object.keys(update).length) {
    const updated = await User.findByIdAndUpdate(id, update, { returnDocument: "after" }).lean();
    if (!updated) throw new HttpError(404, "کاربر پیدا نشد");
    void emitUserUpdate(toUser(updated));
  }
  if (body.signOut) await signOutUser(id);
  return { user: await getAdminUser(id) };
});

export const DELETE = handle(async (_req, ctx: Ctx) => {
  const admin = await requireAdmin();
  const id = assertId((await ctx.params).id);
  if (id === String(admin._id)) throw new HttpError(400, "حساب خودتان را نمی‌توانید حذف کنید");
  await deleteUser(id);
  return { ok: true };
});
