import { z } from "zod";
import { assertId, handle, requireMessageScope, requireUser } from "@/server/http";
import { markChannelRead } from "@/server/reads";

/** Marks the channel read up to `messageId`, or up to its newest message. Markers only ever move forward. */
export const PUT = handle(async (req, ctx: RouteContext<"/api/channels/[id]/read">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireMessageScope(id, user._id);
  const { messageId } = z.object({ messageId: z.string().optional() }).parse(await req.json().catch(() => ({})));
  return markChannelRead(user._id, id, messageId && assertId(messageId));
});
