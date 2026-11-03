import { assertId, handle, requireUser } from "@/server/http";
import { joinPublicServer } from "@/server/servers";

export const POST = handle(async (_req, ctx: RouteContext<"/api/discover/[id]/join">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return { server: await joinPublicServer(assertId(id), user) };
});
