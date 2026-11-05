import { Types } from "mongoose";
import { toLatinDigits } from "@/lib/phone";
import type { AdminChannelDTO, AdminMessageDTO, AdminServerDTO, AdminStatsDTO, AdminUserDTO } from "@/lib/types";
import { channelAudience } from "./access";
import { isAdminPhone } from "./admins";
import { HttpError } from "./errors";
import { filesOfChannels, releaseFiles } from "./files";
import { closeVoiceRooms } from "./livekit";
import {
  Avatar,
  Channel,
  Conversation,
  Event,
  Friendship,
  Member,
  Message,
  Notification,
  Otp,
  Server,
  Session,
  Upload,
  User,
} from "./models";
import { clearVoiceChannel, emitToAudience, emitToServer, isOnline, realtime, serverRoom, userRoom } from "./realtime";
import { avatarUrl, serverIconUrl } from "./serialize";
import { deleteServer } from "./servers";

const PAGE = 50;
const DAY = 24 * 60 * 60 * 1000;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const searchRegex = (q: string) => new RegExp(escapeRegex(q.trim()), "i");

/** How many documents of a collection point at each of the given ids through `field`, as id → count. */
async function countBy(model: { collection: { aggregate: (pipeline: object[]) => { toArray: () => Promise<unknown[]> } } }, field: string, ids: Types.ObjectId[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = (await model.collection
    .aggregate([{ $match: { [field]: { $in: ids } } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])
    .toArray()) as { _id: Types.ObjectId; n: number }[];
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

export async function adminStats(): Promise<AdminStatsDTO> {
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const [users, newUsers, servers, publicServers, channels, voiceChannels, messages, messagesWeek] = await Promise.all([
    User.estimatedDocumentCount(),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    Server.estimatedDocumentCount(),
    Server.countDocuments({ isPublic: true }),
    Channel.estimatedDocumentCount(),
    Channel.countDocuments({ type: "voice" }),
    Message.estimatedDocumentCount(),
    Message.countDocuments({ createdAt: { $gte: weekAgo } }),
  ]);
  const inVoice = [...realtime.voice.values()].reduce((n, people) => n + people.size, 0);
  return { users, newUsers, servers, publicServers, channels, voiceChannels, messages, messagesWeek, online: realtime.connections.size, inVoice };
}

// ---- Users -------------------------------------------------------------------------------------

const findUser = (id: string) => User.findById(id).lean();
type UserDoc = NonNullable<Awaited<ReturnType<typeof findUser>>>;

export async function listUsers(q: string): Promise<AdminUserDTO[]> {
  const filter: Record<string, unknown> = {};
  if (q.trim()) {
    const digits = toLatinDigits(q).replace(/\D/g, "").replace(/^(0098|98|0)/, "");
    filter.$or = [{ name: searchRegex(q) }, ...(digits.length >= 3 ? [{ phone: new RegExp(escapeRegex(digits)) }] : [])];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(PAGE).lean();
  const ids = users.map((u) => u._id);
  const [memberships, owned] = await Promise.all([countBy(Member, "user", ids), countBy(Server, "owner", ids)]);
  return users.map((u) => toAdminUser(u, memberships.get(String(u._id)) ?? 0, owned.get(String(u._id)) ?? 0));
}

const toAdminUser = (u: UserDoc, servers: number, owned: number): AdminUserDTO => ({
  id: String(u._id),
  name: u.name,
  phone: u.phone,
  color: u.color,
  avatar: u.avatarAt ? avatarUrl(String(u._id), u.avatarAt) : null,
  bio: u.bio ?? "",
  createdAt: u.createdAt.toISOString(),
  lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
  online: isOnline(String(u._id)),
  servers,
  ownedServers: owned,
  isAdmin: isAdminPhone(u.phone),
});

export async function getAdminUser(id: string) {
  const user = await findUser(id);
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  const [memberships, owned] = await Promise.all([countBy(Member, "user", [user._id]), countBy(Server, "owner", [user._id])]);
  return toAdminUser(user, memberships.get(id) ?? 0, owned.get(id) ?? 0);
}

/** Ends every session of the user and closes their open tabs, which then land on the login page. */
export async function signOutUser(userId: string) {
  await Session.deleteMany({ user: userId });
  realtime.io?.in(userRoom(userId)).disconnectSockets(true);
}

/**
 * Removes the person and everything that is only theirs: the servers they own, their messages, direct
 * conversations, friendships and picture. Messages others sent in shared servers stay.
 */
export async function deleteUser(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  if (isAdminPhone(user.phone)) throw new HttpError(400, "حساب مدیر سایت را نمی‌توان از اینجا حذف کرد");

  for (const s of await Server.find({ owner: userId }, { _id: 1 }).lean()) await deleteServer(String(s._id));

  // Tell the other members first, while the memberships still say where they are.
  const memberships = await Member.find({ user: userId }, { server: 1 }).lean();
  for (const m of memberships) emitToServer(String(m.server), "member:remove", { serverId: String(m.server), userId });
  const sockets = realtime.io?.in(userRoom(userId));
  for (const m of memberships) sockets?.socketsLeave(serverRoom(String(m.server)));
  await signOutUser(userId);

  const conversations = (await Conversation.find({ participants: userId }, { _id: 1 }).lean()).map((c) => c._id);
  const ownMessages = await Message.distinct("attachments.key", { author: userId, "attachments.0": { $exists: true } });
  const dmFiles = await filesOfChannels(conversations);
  const uploads = await Upload.distinct("file.key", { uploader: userId });

  await Promise.all([
    Member.deleteMany({ user: userId }),
    Message.deleteMany({ $or: [{ author: userId }, { channel: { $in: conversations } }] }),
    Conversation.deleteMany({ _id: { $in: conversations } }),
    Notification.deleteMany({ $or: [{ user: userId }, { author: userId }] }),
    Friendship.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] }),
    Upload.deleteMany({ uploader: userId }),
    Avatar.deleteOne({ user: userId }),
    Otp.deleteMany({ phone: user.phone }),
    Channel.updateMany({ allowedMembers: userId }, { $pull: { allowedMembers: userId } }),
    Event.updateMany({ interested: userId }, { $pull: { interested: userId } }),
  ]);
  await User.deleteOne({ _id: userId });
  void releaseFiles([...ownMessages.map(String), ...dmFiles, ...uploads.map(String)]);
}

// ---- Servers -----------------------------------------------------------------------------------

export async function listServersForAdmin(q: string): Promise<AdminServerDTO[]> {
  const filter: Record<string, unknown> = {};
  if (q.trim()) filter.$or = [{ name: searchRegex(q) }, { inviteCode: q.trim() }];
  const servers = await Server.find(filter).sort({ createdAt: -1 }).limit(PAGE).lean();
  const ids = servers.map((s) => s._id);
  const [members, channels, owners] = await Promise.all([
    countBy(Member, "server", ids),
    countBy(Channel, "server", ids),
    User.find({ _id: { $in: servers.map((s) => s.owner) } }, { name: 1, phone: 1 }).lean(),
  ]);
  const ownerById = new Map(owners.map((o) => [String(o._id), o]));
  return servers.map((s) => {
    const owner = ownerById.get(String(s.owner));
    return {
      id: String(s._id),
      name: s.name,
      icon: serverIconUrl(String(s._id), s.iconAt),
      inviteCode: s.inviteCode,
      isPublic: !!s.isPublic,
      category: s.category ?? "other",
      createdAt: s.createdAt.toISOString(),
      owner: owner ? { id: String(owner._id), name: owner.name, phone: owner.phone } : null,
      members: members.get(String(s._id)) ?? 0,
      channels: channels.get(String(s._id)) ?? 0,
    };
  });
}

/** Takes the server out of the public directory; its members and invite link are unaffected. */
export async function unlistServer(serverId: string) {
  const res = await Server.updateOne({ _id: serverId }, { isPublic: false });
  if (!res.matchedCount) throw new HttpError(404, "سرور پیدا نشد");
}

// ---- Channels ----------------------------------------------------------------------------------

export async function listChannelsForAdmin(q: string, serverId: string | null): Promise<AdminChannelDTO[]> {
  const filter: Record<string, unknown> = {};
  if (serverId) filter.server = serverId;
  if (q.trim()) filter.name = searchRegex(q);
  const channels = await Channel.find(filter)
    .sort(serverId ? { position: 1, createdAt: 1 } : { createdAt: -1 })
    .limit(serverId ? 500 : PAGE)
    .lean();
  const [servers, messages] = await Promise.all([
    Server.find({ _id: { $in: [...new Set(channels.map((c) => String(c.server)))] } }, { name: 1 }).lean(),
    countBy(Message, "channel", channels.map((c) => c._id)),
  ]);
  const serverById = new Map(servers.map((s) => [String(s._id), s]));
  return channels.map((c) => ({
    id: String(c._id),
    name: c.name,
    type: c.type,
    isPrivate: !!c.isPrivate,
    createdAt: c.createdAt.toISOString(),
    server: { id: String(c.server), name: serverById.get(String(c.server))?.name ?? "—" },
    messages: messages.get(String(c._id)) ?? 0,
    inVoice: realtime.voice.get(String(c._id))?.size ?? 0,
  }));
}

/** Same rules as a server's own managers follow: a server keeps at least one channel, and one public one. */
export async function deleteChannel(channelId: string) {
  const channel = await Channel.findById(channelId).lean();
  if (!channel) throw new HttpError(404, "کانال پیدا نشد");
  const serverId = String(channel.server);
  if ((await Channel.countDocuments({ server: serverId })) <= 1) throw new HttpError(400, "سرور باید دست‌کم یک کانال داشته باشد");
  if (!channel.isPrivate && !(await Channel.exists({ server: serverId, _id: { $ne: channelId }, isPrivate: { $ne: true } }))) {
    throw new HttpError(400, "سرور باید دست‌کم یک کانال عمومی داشته باشد");
  }

  const audience = await channelAudience(channel);
  if (channel.type === "voice") {
    clearVoiceChannel(serverId, channelId);
    await closeVoiceRooms([channelId]);
  }
  const files = await filesOfChannels([channelId]);
  const messageIds = (await Message.distinct("_id", { channel: channelId })) as Types.ObjectId[];
  await Promise.all([
    Channel.deleteOne({ _id: channelId }),
    Message.deleteMany({ channel: channelId }),
    Notification.deleteMany({ message: { $in: messageIds } }),
    Event.updateMany({ channel: channelId }, { channel: null }),
  ]);
  void releaseFiles(files);
  emitToAudience(serverId, audience, "channel:delete", { serverId, channelId });
}

// ---- Messages ----------------------------------------------------------------------------------

/**
 * The latest messages in server channels, for moderation. Direct conversations are left out on purpose:
 * they are between two people and not the site's to read.
 */
export async function listMessagesForAdmin(q: string, channelId: string | null): Promise<AdminMessageDTO[]> {
  const match: Record<string, unknown> = {};
  if (channelId) match.channel = new Types.ObjectId(channelId);
  if (q.trim()) match.content = searchRegex(q);
  const rows: {
    _id: Types.ObjectId;
    author: Types.ObjectId;
    content: string;
    sticker?: string | null;
    attachments?: unknown[];
    createdAt: Date;
    channel: { _id: Types.ObjectId; name: string; server: Types.ObjectId }[];
  }[] = await Message.aggregate([
    { $match: match },
    { $sort: { _id: -1 } },
    { $limit: 1000 },
    { $lookup: { from: Channel.collection.name, localField: "channel", foreignField: "_id", as: "channel", pipeline: [{ $project: { name: 1, server: 1 } }] } },
    { $match: { "channel.0": { $exists: true } } },
    { $limit: PAGE },
  ]);
  const [authors, servers] = await Promise.all([
    User.find({ _id: { $in: rows.map((r) => r.author) } }, { name: 1, phone: 1, color: 1 }).lean(),
    Server.find({ _id: { $in: rows.map((r) => r.channel[0].server) } }, { name: 1 }).lean(),
  ]);
  const authorById = new Map(authors.map((a) => [String(a._id), a]));
  const serverById = new Map(servers.map((s) => [String(s._id), s]));
  return rows.map((r) => {
    const author = authorById.get(String(r.author));
    const channel = r.channel[0];
    return {
      id: String(r._id),
      content: r.content,
      sticker: r.sticker ?? null,
      attachments: r.attachments?.length ?? 0,
      createdAt: r.createdAt.toISOString(),
      author: author ? { id: String(author._id), name: author.name, phone: author.phone, color: author.color } : null,
      channel: { id: String(channel._id), name: channel.name },
      server: { id: String(channel.server), name: serverById.get(String(channel.server))?.name ?? "—" },
    };
  });
}

export async function deleteMessage(messageId: string) {
  const message = await Message.findById(messageId).lean();
  if (!message) throw new HttpError(404, "پیام پیدا نشد");
  const channel = await Channel.findById(message.channel).lean();
  if (!channel) throw new HttpError(404, "پیام پیدا نشد");
  await Message.deleteOne({ _id: messageId });
  await Notification.deleteMany({ message: messageId });
  void releaseFiles((message.attachments ?? []).map((f) => f.key));
  const serverId = String(channel.server);
  emitToAudience(serverId, await channelAudience(channel), "message:delete", { serverId, channelId: String(channel._id), messageId });
}
