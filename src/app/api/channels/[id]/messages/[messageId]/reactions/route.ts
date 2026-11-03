import { Types } from "mongoose";
import { z } from "zod";
import { REACTION_EMOJIS } from "@/lib/permissions";
import { assertCanWrite, assertId, handle, HttpError, requireMessageScope, requireUser } from "@/server/http";
import { toReactions } from "@/server/messages";
import { Message } from "@/server/models";

/**
 * Toggles the caller's reaction. Every step is a single atomic update, so two people reacting to the same
 * message at once can't overwrite each other.
 */
export const PUT = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages/[messageId]/reactions">) => {
  const user = await requireUser();
  const { id, messageId } = await ctx.params;
  const scope = await requireMessageScope(id, user._id);
  assertCanWrite(scope.member);
  const { emoji } = z.object({ emoji: z.enum(REACTION_EMOJIS) }).parse(await req.json());

  assertId(messageId);
  const where = { _id: messageId, channel: id };
  const uid = user._id as Types.ObjectId;

  const removed = await Message.updateOne({ ...where, reactions: { $elemMatch: { emoji, users: uid } } }, { $pull: { "reactions.$.users": uid } });
  if (removed.modifiedCount) {
    await Message.updateOne(where, { $pull: { reactions: { emoji, users: { $size: 0 } } } });
  } else {
    // Join the existing group for this emoji, or start it. If someone starts it between the two steps, retry the join.
    for (let attempt = 0; attempt < 2; attempt++) {
      const joined = await Message.updateOne({ ...where, "reactions.emoji": emoji }, { $addToSet: { "reactions.$.users": uid } });
      if (joined.matchedCount) break;
      const started = await Message.updateOne({ ...where, "reactions.emoji": { $ne: emoji } }, { $push: { reactions: { emoji, users: [uid] } } });
      if (started.matchedCount) break;
      if (attempt === 1 && !(await Message.exists(where))) throw new HttpError(404, "پیام پیدا نشد");
    }
  }

  const updated = await Message.findOne(where, { reactions: 1 }).lean();
  if (!updated) throw new HttpError(404, "پیام پیدا نشد");
  const reactions = toReactions(updated.reactions);
  scope.emit("message:reactions", { serverId: scope.serverId, channelId: id, messageId, reactions });
  return { reactions };
});
