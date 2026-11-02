import { handle, requireUser } from "@/server/http";
import { getServerDetail } from "@/server/servers";

export const GET = handle(async (_req, ctx: RouteContext<"/api/servers/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return getServerDetail(id, user._id);
});
