import { Types } from "mongoose";
import { DM_SCOPE, UNREAD_CAP, type ReadStateDTO } from "@/lib/types";
import { memberCanView } from "./access";
import { HttpError } from "./errors";
import { Channel, Conversation, Member, Message, Notification, ReadState } from "./models";
import { emitToUsers } from "./realtime";
import { memberStanding, rolesByServer } from "./roles";

type Id = Types.ObjectId | string;

/** A channel or conversation someone can read, and the moment they could first see it (earlier messages aren't "new" to them). */
interface Readable {
  id: Types.ObjectId;
  serverId: string;
  since: Date;
}

/** Every text channel (in every server, or just `serverId`) and every conversation this person can read. */
async function readableChannels(userId: Id, serverId?: string): Promise<Readable[]> {
  const memberships = await Member.find({ user: userId, ...(serverId && { server: serverId }) }, { server: 1, owner: 1, roles: 1, createdAt: 1 }).lean();
  const serverIds = memberships.map((m) => m.server);
  const [channels, roles, conversations] = await Promise.all([
    Channel.find({ server: { $in: serverIds }, type: "text" }, { server: 1, isPrivate: 1, allowedRoles: 1, allowedMembers: 1, createdAt: 1 }).lean(),
    rolesByServer(serverIds),
    serverId ? [] : Conversation.find({ participants: userId, lastMessageAt: { $ne: null } }, { createdAt: 1 }).lean(),
  ]);
  const membership = new Map(memberships.map((m) => [String(m.server), m]));
  const out: Readable[] = [];
  for (const c of channels) {
    const m = membership.get(String(c.server));
    if (!m || !memberCanView(c, { user: userId, standing: memberStanding(m, roles.get(String(c.server)) ?? []) })) continue;
    out.push({ id: c._id, serverId: String(c.server), since: new Date(Math.max(m.createdAt.getTime(), c.createdAt.getTime())) });
  }
  for (const c of conversations) out.push({ id: c._id, serverId: DM_SCOPE, since: c.createdAt });
  return out;
}

const latestMessageId = async (channel: Id) => (await Message.findOne({ channel }, { _id: 1 }).sort({ _id: -1 }).lean())?._id ?? null;

/**
 * Where this person stands in everything they can read. A channel they never opened counts from when they could first
 * see it. The very first time anyone asks (when read markers didn't exist yet), everything already there is taken as read.
 */
export async function listReadStates(userId: Id): Promise<ReadStateDTO[]> {
  const channels = await readableChannels(userId);
  const states = await ReadState.find({ user: userId, channel: { $in: channels.map((c) => c.id) } }).lean();

  if (!states.length && !(await ReadState.exists({ user: userId }))) {
    const seeded = await Promise.all(channels.map(async (c) => ({ c, latest: await latestMessageId(c.id) })));
    const rows = seeded.filter((s) => s.latest);
    if (rows.length) {
      await ReadState.bulkWrite(
        rows.map(({ c, latest }) => ({ updateOne: { filter: { user: userId, channel: c.id }, update: { $max: { lastRead: latest! } }, upsert: true } })),
      );
    }
    return seeded.map(({ c, latest }) => ({ channelId: String(c.id), serverId: c.serverId, lastRead: latest ? String(latest) : null, count: 0 }));
  }

  const lastReadOf = new Map(states.map((s) => [String(s.channel), s.lastRead]));
  return Promise.all(
    channels.map(async (c) => {
      const lastRead = lastReadOf.get(String(c.id)) ?? null;
      const after = lastRead ?? Types.ObjectId.createFromTime(Math.floor(c.since.getTime() / 1000));
      const count = await Message.countDocuments({ channel: c.id, _id: { $gt: after }, author: { $ne: userId } }, { limit: UNREAD_CAP });
      return { channelId: String(c.id), serverId: c.serverId, lastRead: lastRead && String(lastRead), count };
    }),
  );
}

/** Moves read markers forward (never back), takes the pings up to them off the list, and tells the person's other devices. */
async function saveReads(userId: Id, reads: { channel: Types.ObjectId; lastRead: Types.ObjectId }[]) {
  if (!reads.length) return [];
  await ReadState.bulkWrite(
    reads.map((r) => ({ updateOne: { filter: { user: userId, channel: r.channel }, update: { $max: { lastRead: r.lastRead } }, upsert: true } })),
  );
  const now = new Date();
  await Promise.all(
    reads.map((r) => Notification.updateMany({ user: userId, channel: r.channel, readAt: null, message: { $lte: r.lastRead } }, { readAt: now })),
  );
  const dto = reads.map((r) => ({ channelId: String(r.channel), lastRead: String(r.lastRead) }));
  emitToUsers([String(userId)], "read:update", { reads: dto });
  return dto;
}

/** Marks a channel (or conversation) read up to a message, or up to its newest one. Access is checked by the caller. */
export async function markChannelRead(userId: Id, channelId: string, messageId?: string) {
  const channel = new Types.ObjectId(channelId);
  let lastRead: Types.ObjectId | null;
  if (messageId) {
    const found = await Message.exists({ _id: messageId, channel });
    if (!found) throw new HttpError(404, "پیام پیدا نشد");
    lastRead = found._id;
  } else lastRead = await latestMessageId(channel);
  if (!lastRead) return { lastRead: null };
  await saveReads(userId, [{ channel, lastRead }]);
  return { lastRead: String(lastRead) };
}

/** "Mark server as read": every channel this person can see there, up to its newest message. */
export async function markServerRead(userId: Id, serverId: string) {
  const channels = await readableChannels(userId, serverId);
  const latest = await Promise.all(channels.map(async (c) => ({ channel: c.id, lastRead: await latestMessageId(c.id) })));
  return { reads: await saveReads(userId, latest.filter((r): r is { channel: Types.ObjectId; lastRead: Types.ObjectId } => !!r.lastRead)) };
}
