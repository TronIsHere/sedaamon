import { z } from "zod";
import { ROLE_PERMISSIONS, type Standing } from "@/lib/permissions";
import { revokeVoiceAccess } from "./channels";
import { HttpError } from "./errors";
import { Member } from "./models";
import { emitToServer } from "./realtime";
import { memberStanding, serverRoles } from "./roles";

export const MAX_ROLES = 50;

/** A role as sent when creating or editing one. */
export const roleInput = z.object({
  name: z.string().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  permissions: z.array(z.enum(ROLE_PERMISSIONS)).optional(),
});

export function cleanRoleName(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 1 || clean.length > 32) throw new HttpError(400, "نام نقش باید بین ۱ تا ۳۲ حرف باشد");
  return clean;
}

/** Nobody can hand out a power they don't have themselves. The owner has them all. */
export function assertCanGrant(actor: Standing, permissions: readonly string[]) {
  if (!actor.owner && permissions.some((p) => !actor.permissions.includes(p as Standing["permissions"][number]))) {
    throw new HttpError(403, "فقط اختیاراتی را می‌توانید به نقش بدهید که خودتان دارید");
  }
}

/**
 * Runs a change to a server's roles, then takes people out of private voice rooms they can no longer enter and
 * tells every open screen to fetch the server again, since channels, colours and permissions may all have moved.
 */
export async function changeRoles(serverId: string, change: () => Promise<unknown>) {
  const members = await Member.find({ server: serverId }, { user: 1, owner: 1, roles: 1 }).lean();
  const rolesBefore = await serverRoles(serverId);
  const before = new Map(members.map((m) => [String(m.user), memberStanding(m, rolesBefore)]));

  await change();

  const [after, rolesAfter] = await Promise.all([Member.find({ server: serverId }, { user: 1, owner: 1, roles: 1 }).lean(), serverRoles(serverId)]);
  await revokeVoiceAccess(
    serverId,
    after.flatMap((m) => {
      const was = before.get(String(m.user));
      return was ? [{ userId: String(m.user), before: was, after: memberStanding(m, rolesAfter) }] : [];
    }),
  );
  emitToServer(serverId, "roles:changed", { serverId });
  return rolesAfter;
}
