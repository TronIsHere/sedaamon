import { z } from "zod";
import { CATEGORY_IDS, MAX_DESCRIPTION } from "@/lib/discovery";
import { assertId, assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { deleteServer, getServerDetail, renameServer, renewInvite, transferOwnership, updateDiscovery, updateWelcome } from "@/server/servers";

type Ctx = RouteContext<"/api/servers/[id]">;

export const GET = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return getServerDetail(id, user._id);
});

/**
 * Rename the server, renew its invite link, list it in the directory or edit its welcome screen (owner and admins), or hand it to another member (owner only).
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
      discovery: z
        .object({
          isPublic: z.boolean(),
          description: z.string().max(MAX_DESCRIPTION * 2),
          category: z.enum(CATEGORY_IDS),
          tags: z.array(z.string().max(60)).max(20),
        })
        .optional(),
      welcome: z
        .object({
          enabled: z.boolean(),
          title: z.string().max(60),
          message: z.string().max(500),
          rules: z.array(z.string().max(200)).max(10),
          requireRules: z.boolean(),
          channelIds: z.array(z.string()).max(5),
        })
        .optional(),
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
  if (body.discovery) {
    assertPermission(member, "server:manage", "فقط مالک و مدیران سرور می‌توانند آن را در فهرست عمومی قرار دهند");
    await updateDiscovery(id, body.discovery);
  }
  if (body.welcome) {
    assertPermission(member, "server:manage", "فقط مالک و مدیران سرور می‌توانند پیام خوش‌آمدگویی را تغییر دهند");
    await updateWelcome(id, body.welcome);
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
