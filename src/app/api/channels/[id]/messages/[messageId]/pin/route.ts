import { z } from "zod";
import { assertId, assertPermission, handle, HttpError, requireMessageScope, requireUser } from "@/server/http";
import { MAX_PINS, serializeMessage } from "@/server/messages";
import { Message } from "@/server/models";

/** Pins or unpins a message. Setting the state rather than toggling it keeps a double click harmless. */
export const PUT = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages/[messageId]/pin">) => {
  const user = await requireUser();
  const { id, messageId } = await ctx.params;
  const scope = await requireMessageScope(id, user._id);
  assertPermission(scope.member, "message:pin", "فقط مدیران می‌توانند پیام را سنجاق کنند");
  const { pinned } = z.object({ pinned: z.boolean() }).parse(await req.json());

  const where = { _id: assertId(messageId), channel: id };
  const existing = await Message.findOne(where).lean();
  if (!existing) throw new HttpError(404, "پیام پیدا نشد");

  if (!!existing.pinnedAt === pinned) return { message: await serializeMessage(existing) };
  if (pinned && (await Message.countDocuments({ channel: id, pinnedAt: { $ne: null } })) >= MAX_PINS) {
    throw new HttpError(400, "بیش از ۵۰ پیام را نمی‌توان سنجاق کرد");
  }

  const updated = await Message.findOneAndUpdate(where, { pinnedAt: pinned ? new Date() : null }, { new: true }).lean();
  if (!updated) throw new HttpError(404, "پیام پیدا نشد");
  const message = await serializeMessage(updated);
  scope.emit("message:pin", { ...message, serverId: scope.serverId });
  return { message };
});
