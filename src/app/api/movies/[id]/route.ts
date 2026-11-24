import { handle, HttpError, requireUser } from "@/server/http";
import { canManageLibrary, deleteMovie, streamMovie } from "@/server/cinema";

/** The film itself, for anyone signed in: every cinema room plays from the same library. */
export const GET = handle(async (req, ctx: RouteContext<"/api/movies/[id]">) => {
  await requireUser();
  const { id } = await ctx.params;
  return streamMovie(req, id);
});

/** Takes a film out of the library. Site admin only. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/movies/[id]">) => {
  const user = await requireUser();
  if (!canManageLibrary(user)) throw new HttpError(403, "فقط مدیر صدامون می‌تواند فیلم حذف کند");
  const { id } = await ctx.params;
  await deleteMovie(id);
  return { ok: true };
});
