import { handle, requireUser } from "@/server/http";
import { streamSubtitle } from "@/server/cinema";

/** A subtitle taken out of a film, for anyone signed in, like the film itself. */
export const GET = handle(async (_req, ctx: RouteContext<"/api/movies/[id]/subtitles/[subtitleId]">) => {
  await requireUser();
  const { id, subtitleId } = await ctx.params;
  return streamSubtitle(id, subtitleId);
});
