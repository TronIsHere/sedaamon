import { handle, requireAdmin } from "@/server/http";
import { cancelImport } from "@/server/movieImport";

/** Stops a download that is still running, or clears a finished one from the list. Site admin only. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/movies/imports/[id]">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  cancelImport(id);
  return { ok: true };
});
