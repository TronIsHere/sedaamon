import { z } from "zod";
import { banUser, listBans } from "@/server/bans";
import { assertId, assertPermission, handle, requireMember, requireUser } from "@/server/http";

/** Who is banned from the server, newest first. For moderators. */
export const GET = handle(async (_req, ctx: RouteContext<"/api/servers/[id]/bans">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  assertPermission(await requireMember(id, user._id), "member:moderate");
  return { bans: await listBans(id) };
});

/** Bans someone ranked below you: they're removed now and can't rejoin by invite or from the directory. */
export const POST = handle(async (req, ctx: RouteContext<"/api/servers/[id]/bans">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  const { userId, reason = "" } = z.object({ userId: z.string(), reason: z.string().max(200).optional() }).parse(await req.json());
  await banUser(id, { _id: user._id, standing: member.standing }, assertId(userId), reason);
  return { bans: await listBans(id) };
});
