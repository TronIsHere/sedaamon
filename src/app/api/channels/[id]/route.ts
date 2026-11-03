import { z } from "zod";
import { assertPermission, handle, HttpError, requireChannelAccess, requireUser } from "@/server/http";
import { Channel, Event, Message } from "@/server/models";
import { emitToServer } from "@/server/realtime";
import { toChannel } from "@/server/serialize";

export const PATCH = handle(async (req, ctx: RouteContext<"/api/channels/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { member } = await requireChannelAccess(id, user._id);
  assertPermission(member, "channel:manage", "فقط مالک و مدیران سرور می‌توانند کانال را ویرایش کنند");

  const { name } = z.object({ name: z.string() }).parse(await req.json());
  const clean = name.trim().replace(/\s+/g, "-");
  if (clean.length < 1 || clean.length > 32) throw new HttpError(400, "نام کانال باید بین ۱ تا ۳۲ حرف باشد");

  const channel = toChannel((await Channel.findByIdAndUpdate(id, { name: clean }, { new: true }).lean())!);
  emitToServer(channel.serverId, "channel:update", channel);
  return { channel };
});

export const DELETE = handle(async (_req, ctx: RouteContext<"/api/channels/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { channel, member } = await requireChannelAccess(id, user._id);
  assertPermission(member, "channel:manage", "فقط مالک و مدیران سرور می‌توانند کانال را حذف کنند");

  const serverId = String(channel.server);
  if ((await Channel.countDocuments({ server: serverId })) <= 1) throw new HttpError(400, "سرور باید دست‌کم یک کانال داشته باشد");

  await Promise.all([Channel.deleteOne({ _id: id }), Message.deleteMany({ channel: id }), Event.updateMany({ channel: id }, { channel: null })]);
  emitToServer(serverId, "channel:delete", { serverId, channelId: id });
  return { ok: true };
});
