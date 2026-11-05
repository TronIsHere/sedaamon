import { handle, requireMember, requireUser } from "@/server/http";
import { markServerRead } from "@/server/reads";

/** "Mark server as read": every channel you can see there, along with its pings. */
export const POST = handle(async (_req, ctx: RouteContext<"/api/servers/[id]/read">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireMember(id, user._id);
  return markServerRead(user._id, id);
});
