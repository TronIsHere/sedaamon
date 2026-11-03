import { z } from "zod";
import { channelAudience } from "@/server/access";
import { channelAccessInput, membersOf } from "@/server/channels";
import { assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Channel } from "@/server/models";
import { emitToAudience } from "@/server/realtime";
import { toChannel } from "@/server/serialize";

export const POST = handle(async (req, ctx: RouteContext<"/api/servers/[id]/channels">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  assertPermission(member, "channel:manage", "فقط مالک و مدیران سرور می‌توانند کانال بسازند");

  const body = channelAccessInput.extend({ name: z.string(), type: z.enum(["text", "voice"]) }).parse(await req.json());
  const name = body.name.trim().replace(/\s+/g, "-");
  if (name.length < 1 || name.length > 32) throw new HttpError(400, "نام کانال باید بین ۱ تا ۳۲ حرف باشد");

  const last = await Channel.findOne({ server: id }).sort({ position: -1 }).lean();
  const isPrivate = !!body.isPrivate;
  const doc = await Channel.create({
    server: id,
    name,
    type: body.type,
    position: (last?.position ?? 0) + 1,
    isPrivate,
    allowedRoles: isPrivate ? (body.allowedRoles ?? []) : [],
    allowedMembers: isPrivate ? await membersOf(id, body.allowedMembers ?? []) : [],
  });
  const channel = toChannel(doc);
  emitToAudience(id, await channelAudience(doc), "channel:new", channel);
  return { channel };
});
