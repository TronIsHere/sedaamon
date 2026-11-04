import { z } from "zod";
import { unlistServer } from "@/server/admin";
import { assertId, handle, HttpError, requireAdmin } from "@/server/http";
import { Server } from "@/server/models";
import { deleteServer, renameServer, renewInvite } from "@/server/servers";

type Ctx = RouteContext<"/api/admin/servers/[id]">;

/** Rename a server, renew its invite link or take it out of the public directory. */
export const PATCH = handle(async (req, ctx: Ctx) => {
  await requireAdmin();
  const id = assertId((await ctx.params).id);
  const body = z
    .object({ name: z.string().optional(), renewInvite: z.literal(true).optional(), unlist: z.literal(true).optional() })
    .parse(await req.json());

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 40) throw new HttpError(400, "نام سرور باید بین ۲ تا ۴۰ حرف باشد");
    await renameServer(id, name);
  }
  if (body.renewInvite) await renewInvite(id);
  if (body.unlist) await unlistServer(id);
  return { ok: true };
});

export const DELETE = handle(async (_req, ctx: Ctx) => {
  await requireAdmin();
  const id = assertId((await ctx.params).id);
  if (!(await Server.exists({ _id: id }))) throw new HttpError(404, "سرور پیدا نشد");
  await deleteServer(id);
  return { ok: true };
});
