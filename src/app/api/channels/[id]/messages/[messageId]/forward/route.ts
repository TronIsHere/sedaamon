import { z } from "zod";
import { forwardMessage } from "@/server/forward";
import { handle, requireUser } from "@/server/http";

/** Forwards a message to another channel (`channelId`) or to a person (`userId`), with an "originally from" note. */
export const POST = handle(async (req, ctx: RouteContext<"/api/channels/[id]/messages/[messageId]/forward">) => {
  const user = await requireUser();
  const { id, messageId } = await ctx.params;
  const target = z.object({ channelId: z.string().optional(), userId: z.string().optional() }).parse(await req.json());
  return { message: await forwardMessage(user, id, messageId, target) };
});
