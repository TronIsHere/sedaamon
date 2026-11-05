import { assertId, handle, HttpError, requireUser } from "@/server/http";
import { imageResponse } from "@/server/images";
import { Avatar } from "@/server/models";

/**
 * The URL carries the upload time as `?v=`, so a given URL never changes meaning and can be cached for good.
 * Signing in is required, but not a shared server: pictures are not private the way profiles are.
 */
export const GET = handle(async (_req, ctx: RouteContext<"/api/users/[id]/avatar">) => {
  await requireUser();
  const { id } = await ctx.params;
  const avatar = await Avatar.findOne({ user: assertId(id) }).lean();
  if (!avatar) throw new HttpError(404, "تصویری ندارد");
  return imageResponse(avatar);
});
