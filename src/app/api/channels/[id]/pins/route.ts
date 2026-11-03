import { handle, requireMessageScope, requireUser } from "@/server/http";
import { MAX_PINS, serializeMessages } from "@/server/messages";
import { Message } from "@/server/models";

/** Every pinned message of a channel, newest pin first, even those far back in its history. */
export const GET = handle(async (_req, ctx: RouteContext<"/api/channels/[id]/pins">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireMessageScope(id, user._id);

  const docs = await Message.find({ channel: id, pinnedAt: { $ne: null } }).sort({ pinnedAt: -1 }).limit(MAX_PINS).lean();
  return { messages: await serializeMessages(docs) };
});
