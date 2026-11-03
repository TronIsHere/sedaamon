import { getProfile } from "@/server/friends";
import { handle, requireUser } from "@/server/http";

export const GET = handle(async (_req, ctx: RouteContext<"/api/users/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return { profile: await getProfile(user._id, id) };
});
