import { unbanUser } from "@/server/bans";
import { assertId, assertPermission, handle, requireMember, requireUser } from "@/server/http";

/** Lifts a ban. The person can then come back with an invite; they aren't added back by themselves. */
export const DELETE = handle(async (_req, ctx: RouteContext<"/api/servers/[id]/bans/[userId]">) => {
  const user = await requireUser();
  const { id, userId } = await ctx.params;
  assertPermission(await requireMember(id, user._id), "member:moderate");
  await unbanUser(id, assertId(userId));
  return { ok: true };
});
