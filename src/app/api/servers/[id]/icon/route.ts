import { assertId, assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { imageResponse, readImage } from "@/server/images";
import { ServerIcon } from "@/server/models";
import { getServerDetail, setServerIcon } from "@/server/servers";

type Ctx = RouteContext<"/api/servers/[id]/icon">;

/** Signing in is enough, not membership: the directory and invite links show the picture to people outside. */
export const GET = handle(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const icon = await ServerIcon.findOne({ server: assertId(id) }).lean();
  if (!icon) throw new HttpError(404, "تصویری ندارد");
  return imageResponse(icon);
});

/** The request body is the image itself. The result is the new detail. */
export const POST = handle(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  assertPermission(member, "server:manage", "فقط مالک و مدیران سرور می‌توانند تصویر آن را تغییر دهند");
  await setServerIcon(id, await readImage(req));
  return getServerDetail(id, user._id);
});

export const DELETE = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  assertPermission(member, "server:manage", "فقط مالک و مدیران سرور می‌توانند تصویر آن را تغییر دهند");
  await setServerIcon(id, null);
  return getServerDetail(id, user._id);
});
