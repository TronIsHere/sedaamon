import { z } from "zod";
import { canModerate, can } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { assertId, handle, HttpError, requireMember, requireUser } from "@/server/http";
import { Member, User } from "@/server/models";
import { emitToServer, realtime, serverRoom, userRoom } from "@/server/realtime";
import { toMember } from "@/server/serialize";

type Ctx = RouteContext<"/api/servers/[id]/members/[userId]">;

const MAX_MUTE_MINUTES = 60 * 24 * 28;

/**
 * Change a member's role (owner only) or mute/unmute them (admins and the owner, for people ranked below them).
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
      role: z.enum(["admin", "member"]).optional(),
      // Minutes to mute for, or null to lift the mute.
      muteMinutes: z.number().int().min(1).max(MAX_MUTE_MINUTES).nullable().optional(),
    })
    .parse(await req.json());

  const actorRole = actorMember.role as Role;
  if (target.role === "owner") throw new HttpError(403, "نقش مالک سرور تغییر نمی‌کند");

  if (body.role !== undefined) {
    if (!can(actorRole, "role:assign")) throw new HttpError(403, "فقط مالک سرور می‌تواند نقش‌ها را تغییر دهد");
    target.role = body.role;
  }
  if (body.muteMinutes !== undefined) {
    if (!canModerate(actorRole, target.role as Role)) throw new HttpError(403, "نمی‌توانید این عضو را بی‌صدا کنید");
    target.mutedUntil = body.muteMinutes === null ? null : new Date(Date.now() + body.muteMinutes * 60_000);
  }
  await target.save();

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
  if (leaving && target.role === "owner") throw new HttpError(400, "مالک نمی‌تواند سرور را ترک کند");
  if (!leaving && !canModerate(actorMember.role as Role, target.role as Role)) {
    throw new HttpError(403, "نمی‌توانید این عضو را اخراج کنید");
  }

  await Member.deleteOne({ _id: target._id });
  emitToServer(id, "member:remove", { serverId: id, userId });
  // The removed user's sockets stop receiving this server's events and learn they're out.
  const sockets = realtime.io?.in(userRoom(userId));
  sockets?.socketsLeave(serverRoom(id));
  sockets?.emit("server:removed", { serverId: id, kicked: !leaving });
  return { ok: true };
});
