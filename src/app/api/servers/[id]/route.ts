import { z } from "zod";
import { assertId, assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { deleteServer, getServerDetail, renameServer, renewInvite, transferOwnership } from "@/server/servers";

type Ctx = RouteContext<"/api/servers/[id]">;

export const GET = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return getServerDetail(id, user._id);
});

/**
 * Rename the server or renew its invite link (owner and admins), or hand it to another member (owner only).
 * The result is the new detail, since several things can change in one call.
 */
export const PATCH = handle(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);

  const body = z
    .object({
      name: z.string().optional(),
      renewInvite: z.literal(true).optional(),
      ownerId: z.string().optional(),
    })
    .parse(await req.json());

  if (body.name !== undefined) {
    assertPermission(member, "server:manage", "فقط مالک و مدیران سرور می‌توانند نام آن را تغییر دهند");
    const name = body.name.trim();
    if (name.length < 2 || name.length > 40) throw new HttpError(400, "نام سرور باید بین ۲ تا ۴۰ حرف باشد");
    await renameServer(id, name);
  }
  if (body.renewInvite) {
    assertPermission(member, "server:manage", "فقط مالک و مدیران سرور می‌توانند لینک دعوت را عوض کنند");
    await renewInvite(id);
  }
  if (body.ownerId !== undefined) {
    assertPermission(member, "server:own", "فقط مالک سرور می‌تواند آن را به دیگری بدهد");
    await transferOwnership(id, user._id, assertId(body.ownerId));
  }
  return getServerDetail(id, user._id);
});

/** Deleting is owner-only and has to be confirmed by typing the server's name. */
export const DELETE = handle(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  assertPermission(member, "server:own", "فقط مالک سرور می‌تواند آن را حذف کند");

  const { confirmName } = z.object({ confirmName: z.string() }).parse(await req.json());
  const detail = await getServerDetail(id, user._id);
  if (confirmName.trim() !== detail.server.name) throw new HttpError(400, "نام واردشده با نام سرور یکی نیست");

  await deleteServer(id);
  return { ok: true };
});
