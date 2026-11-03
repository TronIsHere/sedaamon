import type { Types } from "mongoose";
import { canViewChannel, type ChannelAccess } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { Channel, Member } from "./models";

// Kept free of realtime and http so both can use it: voice broadcasts need an audience, and routes need to emit to one.

interface ChannelDoc {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  isPrivate?: boolean | null;
  allowedRoles?: string[] | null;
  allowedMembers?: Types.ObjectId[] | null;
}

export const accessOf = (c: Pick<ChannelDoc, "isPrivate" | "allowedRoles" | "allowedMembers">): ChannelAccess => ({
  isPrivate: !!c.isPrivate,
  allowedRoles: c.allowedRoles ?? [],
  allowedMembers: (c.allowedMembers ?? []).map(String),
});

/** Whether this member of the channel's server may see it. */
export const memberCanView = (channel: ChannelDoc, member: { role: string; user: Types.ObjectId | string }) =>
  canViewChannel(accessOf(channel), member.role as Role, String(member.user));

/** Ids of everyone who may see a private channel, or null for a public one, which the whole server sees. */
export async function channelAudience(channel: ChannelDoc): Promise<string[] | null> {
  if (!channel.isPrivate) return null;
  const members = await Member.find({ server: channel.server }, { user: 1, role: 1 }).lean();
  return members.filter((m) => memberCanView(channel, m)).map((m) => String(m.user));
}

/** The audience of a channel looked up by id. One that no longer exists counts as public, since there is nothing left to hide. */
export async function channelAudienceById(channelId: string) {
  const channel = await Channel.findById(channelId, { server: 1, isPrivate: 1, allowedRoles: 1, allowedMembers: 1 }).lean();
  return channel ? channelAudience(channel) : null;
}

/** Of these channels, the ones this person may see. Channels that no longer exist, or whose server they left, are not among them. */
export async function viewableChannelIds(userId: Types.ObjectId, channelIds: Types.ObjectId[]) {
  const channels = await Channel.find({ _id: { $in: channelIds } }, { server: 1, isPrivate: 1, allowedRoles: 1, allowedMembers: 1 }).lean();
  const memberships = await Member.find({ user: userId, server: { $in: [...new Set(channels.map((c) => String(c.server)))] } }, { server: 1, role: 1 }).lean();
  const byServer = new Map(memberships.map((m) => [String(m.server), m]));
  return new Set(
    channels.filter((c) => {
      const membership = byServer.get(String(c.server));
      return !!membership && memberCanView(c, { role: membership.role, user: userId });
    }).map((c) => String(c._id)),
  );
}
