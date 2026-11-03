import type { Types } from "mongoose";
import type { ChannelDTO, MeDTO, MemberDTO, Role, ServerDTO, Status, UserDTO } from "@/lib/types";

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

export const toMe = (u: UserDoc & { phone: string }): MeDTO => ({ ...toUser(u), phone: u.phone, bio: u.bio ?? "" });

export const toMember = (
  m: { role: string; mutedUntil?: Date | null },
  user: UserDoc,
): MemberDTO => ({
  user: toUser(user),
  role: m.role as Role,
  mutedUntil: m.mutedUntil && m.mutedUntil.getTime() > Date.now() ? m.mutedUntil.toISOString() : null,
});

export const toServer = (
  s: { _id: Types.ObjectId; name: string; inviteCode: string },
  role: Role,
): ServerDTO => ({ id: String(s._id), name: s.name, inviteCode: s.inviteCode, role });

export const toChannel = (c: {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  name: string;
  type: "text" | "voice";
  position: number;
}): ChannelDTO => ({
  id: String(c._id),
  serverId: String(c.server),
  name: c.name,
  type: c.type,
  position: c.position,
});
