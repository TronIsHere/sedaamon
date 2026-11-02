import { z } from "zod";
import { handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Channel } from "@/server/models";
import { emitToServer } from "@/server/realtime";
import { toChannel } from "@/server/serialize";

export const POST = handle(async (req, ctx: RouteContext<"/api/servers/[id]/channels">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  if (member.role !== "owner") throw new HttpError(403, "فقط مالک سرور می‌تواند کانال بسازد");

  const body = z.object({ name: z.string(), type: z.enum(["text", "voice"]) }).parse(await req.json());
  const name = body.name.trim().replace(/\s+/g, "-");
  if (name.length < 1 || name.length > 32) throw new HttpError(400, "نام کانال باید بین ۱ تا ۳۲ حرف باشد");

  const last = await Channel.findOne({ server: id }).sort({ position: -1 }).lean();
  const channel = toChannel(
    await Channel.create({ server: id, name, type: body.type, position: (last?.position ?? 0) + 1 }),
  );
  emitToServer(id, "channel:new", channel);
  return { channel };
});
