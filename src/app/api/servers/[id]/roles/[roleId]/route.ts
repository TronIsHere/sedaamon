import { z } from "zod";
import { canManageRole } from "@/lib/permissions";
import { assertId, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Channel, Member, ServerRole } from "@/server/models";
import { assertCanGrant, changeRoles, cleanRoleName, roleInput } from "@/server/roleUpdates";
import { toRole } from "@/server/roles";

type Ctx = RouteContext<"/api/servers/[id]/roles/[roleId]">;

/** The role, if the person asking may manage it: the owner, or someone who manages roles and sits above it. */
async function loadManaged(ctx: Ctx, userId: Parameters<typeof requireMember>[1]) {
  const { id, roleId } = await ctx.params;
  const member = await requireMember(id, userId);
  const role = await ServerRole.findOne({ _id: assertId(roleId), server: id }).lean();
  if (!role) throw new HttpError(404, "نقش پیدا نشد");
  if (!canManageRole(member.standing, role)) throw new HttpError(403, "فقط نقش‌های پایین‌تر از نقش خودتان را می‌توانید تغییر دهید");
  return { serverId: id, member, role };
}

/** Rename, recolour or change the permissions of a role, or move it one step up or down the order. */
export const PATCH = handle(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { serverId, member, role } = await loadManaged(ctx, user._id);
  const body = roleInput.extend({ move: z.enum(["up", "down"]).optional() }).parse(await req.json());

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = cleanRoleName(body.name);
  if (body.color !== undefined) update.color = body.color;
  if (body.permissions !== undefined) {
    // Powers the role already had may stay even if the editor lacks them; only new ones are checked.
    assertCanGrant(member.standing, body.permissions.filter((p) => !role.permissions.includes(p)));
    update.permissions = body.permissions;
  }

  let swapWith: { _id: unknown; position: number } | null = null;
  if (body.move) {
    const up = body.move === "up";
    swapWith = await ServerRole.findOne({ server: serverId, position: up ? { $gt: role.position } : { $lt: role.position } })
      .sort({ position: up ? 1 : -1 })
      .lean();
    if (!swapWith) throw new HttpError(400, up ? "این نقش همین الان بالاترین است" : "این نقش همین الان پایین‌ترین است");
    // Moving up means passing the role above, which has to be one you could manage as well.
    if (up && !canManageRole(member.standing, swapWith)) throw new HttpError(403, "نقشی را نمی‌توانید هم‌تراز یا بالاتر از نقش خودتان ببرید");
  }

  await changeRoles(serverId, async () => {
    if (swapWith) {
      await ServerRole.updateOne({ _id: swapWith._id }, { position: role.position });
      update.position = swapWith.position;
    }
    await ServerRole.updateOne({ _id: role._id }, update);
  });
  const saved = await ServerRole.findById(role._id).lean();
  return { role: toRole(saved!) };
});

/** Deleting a role takes it from everyone who had it and from the private channels it opened. */
export const DELETE = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { serverId, role } = await loadManaged(ctx, user._id);

  await changeRoles(serverId, async () => {
    await Promise.all([
      ServerRole.deleteOne({ _id: role._id }),
      Member.updateMany({ server: serverId, roles: role._id }, { $pull: { roles: role._id } }),
      Channel.updateMany({ server: serverId, allowedRoles: String(role._id) }, { $pull: { allowedRoles: String(role._id) } }),
    ]);
    // Close the gap so positions stay 1…n.
    await ServerRole.updateMany({ server: serverId, position: { $gt: role.position } }, { $inc: { position: -1 } });
  });
  return { ok: true };
});
