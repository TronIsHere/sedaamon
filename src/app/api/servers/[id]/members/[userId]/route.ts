import { z } from "zod";
import { canManageRole, canModerate, can, outranks } from "@/lib/permissions";
import { removeMember } from "@/server/bans";
import { revokeVoiceAccess } from "@/server/channels";
import { assertId, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Member, User } from "@/server/models";
import { emitToServer } from "@/server/realtime";
import { memberStanding, serverRoles } from "@/server/roles";
import { toMember } from "@/server/serialize";

type Ctx = RouteContext<"/api/servers/[id]/members/[userId]">;

const MAX_MUTE_MINUTES = 60 * 24 * 28;

/**
 * Give and take roles (those who manage roles, for roles and people below them) or mute/unmute a member (moderators,
 * for people ranked below them). `roles` is the full list the member should end up with.
 */
export const PATCH = handle(async (req, ctx: Ctx) => {
  const actor = await requireUser();
  const { id, userId } = await ctx.params;
  const actorMember = await requireMember(id, actor._id);
  const target = await Member.findOne({ server: id, user: assertId(userId) });
  if (!target) throw new HttpError(404, "این کاربر عضو سرور نیست");
  if (String(target.user) === String(actor._id)) throw new HttpError(400, "این کار روی خودتان ممکن نیست");

  const body = z
    .object({
      roles: z.array(z.string()).max(100).optional(),
      // Minutes to mute for, or null to lift the mute.
      muteMinutes: z.number().int().min(1).max(MAX_MUTE_MINUTES).nullable().optional(),
    })
    .parse(await req.json());

  const roles = await serverRoles(id);
  const me = actorMember.standing;
  const before = memberStanding(target, roles);

  if (body.roles !== undefined) {
    if (!can(me, "role:manage")) throw new HttpError(403, "اجازهٔ تغییر نقش‌ها را ندارید");
    if (target.owner) throw new HttpError(403, "نقش مالک سرور تغییر نمی‌کند");
    if (!outranks(me, before)) throw new HttpError(403, "نقش اعضای همرده یا بالاتر از خودتان را نمی‌توانید تغییر دهید");
    const wanted = new Set(body.roles);
    // Every role that would be added or removed has to sit below the actor; the others stay as they are.
    const changed = roles.filter((r) => wanted.has(r.id) !== before.roles.includes(r.id));
    if (changed.some((r) => !canManageRole(me, r))) throw new HttpError(403, "فقط نقش‌های پایین‌تر از نقش خودتان را می‌توانید بدهید یا بگیرید");
    target.set("roles", roles.filter((r) => wanted.has(r.id)).map((r) => r.id));
  }
  if (body.muteMinutes !== undefined) {
    if (!canModerate(me, before)) throw new HttpError(403, "نمی‌توانید این عضو را بی‌صدا کنید");
    target.mutedUntil = body.muteMinutes === null ? null : new Date(Date.now() + body.muteMinutes * 60_000);
  }
  await target.save();
  // Losing a role can mean losing a private room, so anyone still in one is taken out of it.
  await revokeVoiceAccess(id, [{ userId: String(target.user), before, after: memberStanding(target, roles) }]);

  const user = await User.findById(target.user).lean();
  const member = toMember(target, user!);
  emitToServer(id, "member:update", { serverId: id, member });
  return { member };
});

/** Remove a member. Everyone can remove themselves (leave), except the owner. */
export const DELETE = handle(async (_req, ctx: Ctx) => {
  const actor = await requireUser();
  const { id, userId } = await ctx.params;
  const actorMember = await requireMember(id, actor._id);
  const target = await Member.findOne({ server: id, user: assertId(userId) }).lean();
  if (!target) throw new HttpError(404, "این کاربر عضو سرور نیست");

  const leaving = String(target.user) === String(actor._id);
  if (leaving && target.owner) throw new HttpError(400, "مالک نمی‌تواند سرور را ترک کند");
  if (!leaving && !canModerate(actorMember.standing, memberStanding(target, await serverRoles(id)))) {
    throw new HttpError(403, "نمی‌توانید این عضو را اخراج کنید");
  }

  await removeMember(id, String(target.user), leaving ? "left" : "kicked");
  return { ok: true };
});
