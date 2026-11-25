import { handle, requireAdmin, requireUser } from "@/server/http";
import { deleteSubtitle, streamSubtitle } from "@/server/cinema";

/** A film's subtitle, for anyone signed in, like the film itself. */
export const GET = handle(async (_req, ctx: RouteContext<"/api/movies/[id]/subtitles/[subtitleId]">) => {
  await requireUser();
  const { id, subtitleId } = await ctx.params;
  return streamSubtitle(id, subtitleId);
});

/** Takes a subtitle off a film. Site admin only. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/movies/[id]/subtitles/[subtitleId]">) => {
  await requireAdmin();
  const { id, subtitleId } = await ctx.params;
  return { movie: await deleteSubtitle(id, subtitleId) };
});
