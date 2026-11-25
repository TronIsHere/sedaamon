import { handle, requireAdmin } from "@/server/http";
import { cancelRepackage, startRepackage } from "@/server/movieRepackage";

/** Has the server repackage a film so that Safari plays it. Site admin only; progress shows in GET /api/movies. */
export const POST = handle(async (_req, ctx: RouteContext<"/api/movies/[id]/repackage">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await startRepackage(id);
  return { ok: true };
});

/** Stops it, or clears a finished one from the list. Site admin only. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/movies/[id]/repackage">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  cancelRepackage(id);
  return { ok: true };
});
