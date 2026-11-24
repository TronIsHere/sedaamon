import { z } from "zod";
import { handle, requireAdmin, requireUser } from "@/server/http";
import { deleteMovie, renameMovie, streamMovie } from "@/server/cinema";

/** The film itself, for anyone signed in: every cinema room plays from the same library. */
export const GET = handle(async (req, ctx: RouteContext<"/api/movies/[id]">) => {
  await requireUser();
  const { id } = await ctx.params;
  return streamMovie(req, id);
});

/** Renames a film. Site admin only. */
export const PATCH = handle(async (req, ctx: RouteContext<"/api/movies/[id]">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const { name } = z.object({ name: z.string() }).parse(await req.json());
  return { movie: await renameMovie(id, name) };
});

/** Takes a film out of the library, and off every cinema screen showing it. Site admin only. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/movies/[id]">) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await deleteMovie(id);
  return { ok: true };
});
