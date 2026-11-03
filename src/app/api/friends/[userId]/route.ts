import { acceptFriendRequest, removeFriendship } from "@/server/friends";
import { handle, requireUser } from "@/server/http";

/** Accept a request that person sent you. */
export const PATCH = handle(async (_req, ctx: RouteContext<"/api/friends/[userId]">) => {
  const user = await requireUser();
  const { userId } = await ctx.params;
  return { friendState: await acceptFriendRequest(user._id, userId) };
});

/** Cancel, decline or unfriend. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/friends/[userId]">) => {
  const user = await requireUser();
  const { userId } = await ctx.params;
  await removeFriendship(user._id, userId);
  return { friendState: "none" };
});
