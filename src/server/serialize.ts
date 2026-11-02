import type { Types } from "mongoose";
import type { ChannelDTO, MeDTO, MessageDTO, Role, ServerDTO, UserDTO } from "@/lib/types";

interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  color: string;
  phone: string;
}

export const toUser = (u: UserDoc): UserDTO => ({ id: String(u._id), name: u.name, color: u.color });

export const toMe = (u: UserDoc): MeDTO => ({ ...toUser(u), phone: u.phone });

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

export const toMessage = (
  m: { _id: Types.ObjectId; channel: Types.ObjectId; content: string; createdAt: Date },
  author: UserDoc,
): MessageDTO => ({
  id: String(m._id),
  channelId: String(m.channel),
  content: m.content,
  createdAt: m.createdAt.toISOString(),
  author: toUser(author),
});
