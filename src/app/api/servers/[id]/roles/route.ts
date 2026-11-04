import { ROLE_COLORS } from "@/lib/permissions";
import { assertPermission, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { ServerRole } from "@/server/models";
import { emitToServer } from "@/server/realtime";
import { assertCanGrant, cleanRoleName, MAX_ROLES, roleInput } from "@/server/roleUpdates";
import { toRole } from "@/server/roles";

/** A new role starts at the bottom, below every other, so whoever made it can go on to manage it. Nobody holds it yet. */
export const POST = handle(async (req, ctx: RouteContext<"/api/servers/[id]/roles">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const member = await requireMember(id, user._id);
  assertPermission(member, "role:manage", "اجازهٔ ساختن نقش را ندارید");

  const body = roleInput.parse(await req.json());
  const name = cleanRoleName(body.name ?? "");
  const permissions = body.permissions ?? [];
  assertCanGrant(member.standing, permissions);
  if ((await ServerRole.countDocuments({ server: id })) >= MAX_ROLES) throw new HttpError(400, `هر سرور حداکثر ${MAX_ROLES} نقش می‌تواند داشته باشد`);

  await ServerRole.updateMany({ server: id }, { $inc: { position: 1 } });
  const role = await ServerRole.create({ server: id, name, color: body.color ?? ROLE_COLORS[0], permissions, position: 1 });
  emitToServer(id, "roles:changed", { serverId: id });
  return { role: toRole(role) };
});
