import { z } from "zod";
import { outranks } from "@/lib/permissions";
import { assertCanWrite, assertId, assertPermission, handle, HttpError, requireMessageScope, requireUser } from "@/server/http";
import { serializeMessage } from "@/server/messages";
import { Message, Notification } from "@/server/models";
import { keepMentions } from "@/server/notifications";
import { findMemberWithStanding } from "@/server/roles";

type Ctx = RouteContext<"/api/channels/[id]/messages/[messageId]">;

async function loadMessage(channelId: string, messageId: string) {
  const message = await Message.findOne({ _id: assertId(messageId), channel: channelId }).lean();
  if (!message) throw new HttpError(404, "پیام پیدا نشد");
  return message;
}

/** Only the author edits a message; nobody, not even the owner, can put words in someone else's mouth. */
export const PATCH = handle(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id, messageId } = await ctx.params;
  const scope = await requireMessageScope(id, user._id);
  assertCanWrite(scope.member);
  const existing = await loadMessage(id, messageId);
  if (String(existing.author) !== String(user._id)) throw new HttpError(403, "فقط نویسندهٔ پیام می‌تواند آن را ویرایش کند");
  if (existing.sticker) throw new HttpError(400, "استیکر را نمی‌شود ویرایش کرد");
  if (existing.forwardedFrom) throw new HttpError(400, "پیام فوروارد‌شده را نمی‌شود ویرایش کرد");

  const { content } = z.object({ content: z.string() }).parse(await req.json());
  const text = content.trim();
  if (!text) throw new HttpError(400, "پیام خالی است");
  if (text.length > 2000) throw new HttpError(400, "پیام نباید بیشتر از ۲۰۰۰ حرف باشد");

  if (text !== existing.content) {
    const updated = await Message.findByIdAndUpdate(
      messageId,
      { content: text, editedAt: new Date(), ...(await keepMentions(existing, text)) },
      { new: true },
    ).lean();
    const message = await serializeMessage(updated!);
    scope.emit("message:edit", { ...message, serverId: scope.serverId });
    return { message };
  }
  return { message: await serializeMessage(existing) };
});

/** The author can always delete; admins and the owner can delete messages from people below them. */
export const DELETE = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id, messageId } = await ctx.params;
  const scope = await requireMessageScope(id, user._id);
  const existing = await loadMessage(id, messageId);

  if (String(existing.author) !== String(user._id)) {
    assertPermission(scope.member, "message:delete_any");
    const authorMember = await findMemberWithStanding(scope.serverId, existing.author);
    // Someone who has left the server ranks below everyone.
    if (authorMember && !outranks(scope.member.standing, authorMember.standing)) {
      throw new HttpError(403, "نمی‌توانید پیام همرده یا بالاتر از خودتان را حذف کنید");
    }
  }

  await Message.deleteOne({ _id: messageId });
  await Notification.deleteMany({ message: messageId });
  scope.emit("message:delete", { serverId: scope.serverId, channelId: id, messageId });
  return { ok: true };
});
