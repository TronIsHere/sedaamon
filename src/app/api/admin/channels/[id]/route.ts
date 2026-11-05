import { z } from "zod";
import { deleteChannel } from "@/server/admin";
import { broadcastChannelChange } from "@/server/channels";
import { assertId, handle, HttpError, requireAdmin } from "@/server/http";
import { Channel } from "@/server/models";

type Ctx = RouteContext<"/api/admin/channels/[id]">;

export const PATCH = handle(async (req, ctx: Ctx) => {
  await requireAdmin();
  const id = assertId((await ctx.params).id);
  const body = z.object({ name: z.string() }).parse(await req.json());

  const name = body.name.trim().replace(/\s+/g, "-");
  if (name.length < 1 || name.length > 32) throw new HttpError(400, "نام کانال باید بین ۱ تا ۳۲ حرف باشد");
  const before = await Channel.findById(id).lean();
  if (!before) throw new HttpError(404, "کانال پیدا نشد");
  const after = await Channel.findByIdAndUpdate(id, { name }, { returnDocument: "after" }).lean();
  await broadcastChannelChange(before, after!);
  return { ok: true };
});

export const DELETE = handle(async (_req, ctx: Ctx) => {
  await requireAdmin();
  await deleteChannel(assertId((await ctx.params).id));
  return { ok: true };
});
