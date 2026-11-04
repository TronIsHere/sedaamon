import type { Types } from "mongoose";
import { standingOf, type Permission, type Standing } from "@/lib/permissions";
import type { RoleDTO } from "@/lib/types";
import { Channel, Member, ServerRole } from "./models";

// Kept free of realtime and http, like access.ts, so both can use it.

interface RoleDoc {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  name: string;
  color: string;
  permissions?: string[] | null;
  position: number;
}

export const toRole = (r: RoleDoc): RoleDTO => ({
  id: String(r._id),
  serverId: String(r.server),
  name: r.name,
  color: r.color,
  permissions: (r.permissions ?? []) as Permission[],
  position: r.position,
});

/** A server's roles, strongest first. */
export async function serverRoles(serverId: string | Types.ObjectId): Promise<RoleDTO[]> {
  return (await ServerRole.find({ server: serverId }).sort({ position: -1 }).lean()).map(toRole);
}

/** The roles of several servers at once, by server id. */
export async function rolesByServer(serverIds: (string | Types.ObjectId)[]): Promise<Map<string, RoleDTO[]>> {
  const out = new Map<string, RoleDTO[]>();
  if (!serverIds.length) return out;
  for (const r of await ServerRole.find({ server: { $in: serverIds } }).sort({ position: -1 }).lean()) {
    const role = toRole(r);
    out.set(role.serverId, [...(out.get(role.serverId) ?? []), role]);
  }
  return out;
}

export interface MemberRoles {
  owner?: boolean | null;
  roles?: Types.ObjectId[] | null;
}

export const memberStanding = (m: MemberRoles, roles: readonly RoleDTO[]): Standing =>
  standingOf({ owner: m.owner, roles: (m.roles ?? []).map(String) }, roles);

/** One member's row with their standing, or null if they aren't in the server. */
export async function findMemberWithStanding(serverId: string, userId: Types.ObjectId | string) {
  const [member, roles] = await Promise.all([Member.findOne({ server: serverId, user: userId }).lean(), serverRoles(serverId)]);
  return member && { ...member, standing: memberStanding(member, roles) };
}

/** Every server starts with these, from the strongest down. They are ordinary roles: the owner can change or delete them. */
const DEFAULT_ROLES: { legacy: string; name: string; color: string; permissions: Permission[] }[] = [
  {
    legacy: "admin",
    name: "مدیر",
    color: "#38bdf8",
    permissions: ["server:manage", "channel:manage", "channel:view_private", "member:moderate", "message:delete_any", "message:pin", "message:mention_everyone", "event:manage"],
  },
  { legacy: "moderator", name: "ناظر", color: "#a78bfa", permissions: ["member:moderate", "message:delete_any", "message:pin"] },
  { legacy: "channel_manager", name: "مدیر کانال", color: "#fb7185", permissions: ["channel:manage", "channel:view_private", "message:pin"] },
  { legacy: "organizer", name: "برگزارکنندهٔ رویداد", color: "#34d399", permissions: ["event:manage", "message:mention_everyone", "message:pin"] },
];

/** Creates the starting roles, reusing any with the same name (a migration that stopped half-way leaves some behind). */
export async function createDefaultRoles(serverId: Types.ObjectId | string) {
  const existing = await ServerRole.find({ server: serverId }).lean();
  const byLegacy = new Map<string, Types.ObjectId>();
  for (const [i, d] of DEFAULT_ROLES.entries()) {
    const found = existing.find((r) => r.name === d.name);
    const role = found ?? (await ServerRole.create({ server: serverId, name: d.name, color: d.color, permissions: d.permissions, position: DEFAULT_ROLES.length - i }));
    byLegacy.set(d.legacy, role._id);
  }
  return byLegacy;
}

/**
 * Roles used to be a fixed list stored as a word on each member ("admin", "moderator"…) and on private channels.
 * Each server that still has such members gets the default roles, and the words become those roles' ids. Safe to run
 * on every start: once a server is converted there is nothing left to find.
 */
export async function migrateLegacyRoles() {
  const members = Member.collection;
  const serverIds: Types.ObjectId[] = await members.distinct("server", { role: { $exists: true } });
  for (const serverId of serverIds) {
    const byLegacy = await createDefaultRoles(serverId);
    const legacy = await members.find({ server: serverId, role: { $exists: true } }, { projection: { role: 1 } }).toArray();
    for (const m of legacy) {
      const role = byLegacy.get(m.role);
      await members.updateOne(
        { _id: m._id },
        { $set: { owner: m.role === "owner", roles: role ? [role] : [] }, $unset: { role: "" } },
      );
    }
    const channels = await Channel.collection.find({ server: serverId, allowedRoles: { $in: [...byLegacy.keys()] } }).toArray();
    for (const c of channels) {
      const ids = (c.allowedRoles as string[]).map((r) => byLegacy.get(r)?.toString() ?? r);
      await Channel.collection.updateOne({ _id: c._id }, { $set: { allowedRoles: ids } });
    }
  }
  if (serverIds.length) console.log(`> converted the roles of ${serverIds.length} server(s)`);
}
