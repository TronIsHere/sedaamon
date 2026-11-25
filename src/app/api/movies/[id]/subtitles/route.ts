import { handle, requireAdmin } from "@/server/http";
import { addSubtitle } from "@/server/cinema";

/** Adds a subtitle file to a film. Site admin only. The body is the file itself; see addSubtitle for its name. */
export const POST = handle(async (req, ctx: RouteContext<"/api/movies/[id]/subtitles">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  return { movie: await addSubtitle(req, id) };
});
