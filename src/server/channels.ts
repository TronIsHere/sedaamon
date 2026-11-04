import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import { canViewChannel, type Standing } from "@/lib/permissions";
import { accessOf, channelAudience } from "./access";
import { HttpError } from "./errors";
import { broadcastEvent } from "./events";
import { removeFromVoice } from "./livekit";
import { Category, Channel, Event, Member, ServerRole } from "./models";
import { emitToServer, emitToUsers } from "./realtime";
import { toChannel } from "./serialize";

/** Who a channel is for and where it sits, as sent when creating or editing one. */
export const channelAccessInput = z.object({
  isPrivate: z.boolean().optional(),
  allowedRoles: z.array(z.string()).max(100).optional(),
  allowedMembers: z.array(z.string()).max(200).optional(),
  categoryId: z.string().nullable().optional(),
});

/** Keeps only the people who really belong to the server, so a list can't smuggle in outsiders. */
export async function membersOf(serverId: string, ids: string[]): Promise<Types.ObjectId[]> {
  const valid = [...new Set(ids)].filter((id) => isValidObjectId(id));
  if (!valid.length) return [];
  const members = await Member.find({ server: serverId, user: { $in: valid } }, { user: 1 }).lean();
  return members.map((m) => m.user);
}

/** Keeps only the ids of roles this server really has. */
export async function rolesOf(serverId: string, ids: string[]): Promise<string[]> {
  const valid = [...new Set(ids)].filter((id) => isValidObjectId(id));
  if (!valid.length) return [];
  return (await ServerRole.find({ server: serverId, _id: { $in: valid } }, { _id: 1 }).lean()).map((r) => String(r._id));
}

/** The category a channel goes in, checked to belong to the same server. Null puts it above every category. */
export async function categoryOf(serverId: string, id: string | null): Promise<Types.ObjectId | null> {
  if (id === null) return null;
  const found = isValidObjectId(id) ? await Category.exists({ _id: id, server: serverId }) : null;
  if (!found) throw new HttpError(400, "این دسته در سرور نیست");
  return found._id;
}

interface ChannelDoc {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  name: string;
  type: "text" | "voice";
  position: number;
  category?: Types.ObjectId | null;
  isPrivate?: boolean | null;
  allowedRoles?: string[] | null;
  allowedMembers?: Types.ObjectId[] | null;
}

/**
 * Tells everyone what an edit did to them: those who can still see the channel get the new version, those who
 * just gained access learn the channel exists, and those who lost it are told it is gone. Public to public is
 * a plain broadcast.
 */
export async function broadcastChannelChange(before: ChannelDoc, after: ChannelDoc) {
  const serverId = String(after.server);
  const channel = toChannel(after);
  const [was, now] = await Promise.all([channelAudience(before), channelAudience(after)]);
  if (!was && !now) return emitToServer(serverId, "channel:update", channel);

  const everyone = was && now ? [] : (await Member.find({ server: serverId }, { user: 1 }).lean()).map((m) => String(m.user));
  const prev = new Set(was ?? everyone);
  const next = new Set(now ?? everyone);
  emitToUsers([...next].filter((id) => prev.has(id)), "channel:update", channel);
  emitToUsers([...next].filter((id) => !prev.has(id)), "channel:new", channel);
  const lost = [...prev].filter((id) => !next.has(id));
  emitToUsers(lost, "channel:delete", { serverId, channelId: channel.id });
  if (after.type === "voice") await removeFromVoice([[channel.id, lost]]);
}

/** A private channel can't be the meeting place of an event the whole server sees. */
export async function detachEvents(channelId: string) {
  const events = await Event.find({ channel: channelId }).lean();
  if (!events.length) return;
  await Event.updateMany({ channel: channelId }, { channel: null });
  for (const e of events) await broadcastEvent("update", { ...e, channel: null });
}

/** When people lose roles or permissions, takes them out of the private voice rooms they could only join before. */
export async function revokeVoiceAccess(serverId: string, changes: { userId: string; before: Standing; after: Standing }[]) {
  if (!changes.length) return;
  const rooms = await Channel.find({ server: serverId, type: "voice", isPrivate: true }).lean();
  const lost = rooms.map((c): [string, string[]] => {
    const access = accessOf(c);
    const users = changes.filter(({ userId, before, after }) => canViewChannel(access, before, userId) && !canViewChannel(access, after, userId));
    return [String(c._id), users.map((x) => x.userId)];
  });
  await removeFromVoice(lost.filter(([, users]) => users.length));
}
