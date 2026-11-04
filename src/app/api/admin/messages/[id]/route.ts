import { deleteMessage } from "@/server/admin";
import { assertId, handle, requireAdmin } from "@/server/http";

export const DELETE = handle(async (_req, ctx: RouteContext<"/api/admin/messages/[id]">) => {
  await requireAdmin();
  await deleteMessage(assertId((await ctx.params).id));
  return { ok: true };
});
