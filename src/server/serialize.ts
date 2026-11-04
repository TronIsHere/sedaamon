import type { Types } from "mongoose";
import { NEWCOMER_MS } from "@/lib/badges";
import type { Standing } from "@/lib/permissions";
import type { BadgeId, CategoryDTO, ChannelDTO, MeDTO, MemberDTO, ServerDTO, Status, UserDTO } from "@/lib/types";
import { isAdminPhone } from "./admins";

interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  color: string;
  phone?: string;
  bio?: string;
  avatarAt?: Date | null;
  status?: string | null;
  statusText?: string | null;
}

export const avatarUrl = (userId: string, at: Date) => `/api/users/${userId}/avatar?v=${at.getTime()}`;

export const toUser = (u: UserDoc): UserDTO => {
  const id = String(u._id);
  const dto: UserDTO = { id, name: u.name, color: u.color };
  if (u.avatarAt) dto.avatar = avatarUrl(id, u.avatarAt);
  if (u.status && u.status !== "available") dto.status = u.status as Status;
  if (u.statusText) dto.statusText = u.statusText;
  return dto;
};

export const toMe = (u: UserDoc & { phone: string }): MeDTO => ({ ...toUser(u), phone: u.phone, bio: u.bio ?? "", isAdmin: isAdminPhone(u.phone) });

interface MemberDoc {
  owner?: boolean | null;
  roles?: Types.ObjectId[] | null;
  mutedUntil?: Date | null;
  createdAt?: Date;
  joinedVia?: string | null;
  rulesAcceptedAt?: Date | null;
}

/** What a member has earned. Founders and staff already stand out by role, so only plain members are "new". */
export function badgesOf(m: MemberDoc): BadgeId[] {
  const badges: BadgeId[] = [];
  if (!m.owner && !m.roles?.length && m.createdAt && Date.now() - m.createdAt.getTime() < NEWCOMER_MS) badges.push("newcomer");
  if (m.rulesAcceptedAt) badges.push("rule_keeper");
  if (m.joinedVia === "discovery") badges.push("explorer");
  return badges;
}

export const toMember = (m: MemberDoc, user: UserDoc): MemberDTO => ({
  user: toUser(user),
  owner: !!m.owner,
  roles: (m.roles ?? []).map(String),
  mutedUntil: m.mutedUntil && m.mutedUntil.getTime() > Date.now() ? m.mutedUntil.toISOString() : null,
  joinedAt: (m.createdAt ?? new Date()).toISOString(),
  badges: badgesOf(m),
});

export const toServer = (
  s: { _id: Types.ObjectId; name: string; inviteCode: string },
  standing: Standing,
): ServerDTO => ({ id: String(s._id), name: s.name, inviteCode: s.inviteCode, standing });

export const toCategory = (c: { _id: Types.ObjectId; server: Types.ObjectId; name: string; position: number }): CategoryDTO => ({
  id: String(c._id),
  serverId: String(c.server),
  name: c.name,
  position: c.position,
});

export const toChannel = (c: {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  name: string;
  type: "text" | "voice";
  position: number;
  category?: Types.ObjectId | null;
  isPrivate?: boolean | null;
  allowedRoles?: string[] | null;
  allowedMembers?: Types.ObjectId[] | null;
}): ChannelDTO => ({
  id: String(c._id),
  serverId: String(c.server),
  name: c.name,
  type: c.type,
  position: c.position,
  categoryId: c.category ? String(c.category) : null,
  isPrivate: !!c.isPrivate,
  // Channels made before private ones existed have neither list.
  allowedRoles: c.isPrivate ? (c.allowedRoles ?? []) : [],
  allowedMembers: c.isPrivate ? (c.allowedMembers ?? []).map(String) : [],
});
