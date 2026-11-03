import { z } from "zod";
import { channelAudience } from "@/server/access";
import { broadcastChannelChange, channelAccessInput, detachEvents, membersOf } from "@/server/channels";
import { assertPermission, handle, HttpError, requireChannelAccess, requireUser } from "@/server/http";
import { Channel, Event, Message } from "@/server/models";
import { emitToAudience } from "@/server/realtime";
import { toChannel } from "@/server/serialize";

/** Members who can't see private channels need somewhere to land, so one public channel always stays. */
async function assertOtherPublicChannel(serverId: string, channelId: string) {
  if (!(await Channel.exists({ server: serverId, _id: { $ne: channelId }, isPrivate: { $ne: true } }))) {
    throw new HttpError(400, "سرور باید دست‌کم یک کانال عمومی داشته باشد");
  }
}

export const PATCH = handle(async (req, ctx: RouteContext<"/api/channels/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { channel: before, member } = await requireChannelAccess(id, user._id);
  assertPermission(member, "channel:manage", "فقط مالک و مدیران سرور می‌توانند کانال را ویرایش کنند");

  const body = channelAccessInput.extend({ name: z.string().optional() }).parse(await req.json());
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const clean = body.name.trim().replace(/\s+/g, "-");
    if (clean.length < 1 || clean.length > 32) throw new HttpError(400, "نام کانال باید بین ۱ تا ۳۲ حرف باشد");
    update.name = clean;
  }

  const isPrivate = body.isPrivate ?? !!before.isPrivate;
  if (body.isPrivate !== undefined) update.isPrivate = isPrivate;
  if (!isPrivate) {
    // A public channel has no guest list; making it private again starts from a clean one.
    update.allowedRoles = [];
    update.allowedMembers = [];
  } else {
    if (body.allowedRoles !== undefined) update.allowedRoles = body.allowedRoles;
    if (body.allowedMembers !== undefined) update.allowedMembers = await membersOf(String(before.server), body.allowedMembers);
  }

  if (isPrivate && !before.isPrivate) await assertOtherPublicChannel(String(before.server), id);

  const after = await Channel.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!after) throw new HttpError(404, "کانال پیدا نشد");
  if (isPrivate && !before.isPrivate) await detachEvents(id);
  await broadcastChannelChange(before, after);
  return { channel: toChannel(after) };
});

export const DELETE = handle(async (_req, ctx: RouteContext<"/api/channels/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { channel, member } = await requireChannelAccess(id, user._id);
  assertPermission(member, "channel:manage", "فقط مالک و مدیران سرور می‌توانند کانال را حذف کنند");

  const serverId = String(channel.server);
  if ((await Channel.countDocuments({ server: serverId })) <= 1) throw new HttpError(400, "سرور باید دست‌کم یک کانال داشته باشد");
  if (!channel.isPrivate) await assertOtherPublicChannel(serverId, id);

  const audience = await channelAudience(channel);

  await Promise.all([Channel.deleteOne({ _id: id }), Message.deleteMany({ channel: id }), Event.updateMany({ channel: id }, { channel: null })]);
  emitToAudience(serverId, audience, "channel:delete", { serverId, channelId: id });
  return { ok: true };
});
