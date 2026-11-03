import crypto from "node:crypto";
import type { Types } from "mongoose";
import type { MemberDTO, Role, ServerDetailDTO, ServerDTO } from "@/lib/types";
import { listEvents } from "./events";
import { announceJoin } from "./presence";
import { HttpError, requireMember } from "./http";
import { closeVoiceRooms } from "./livekit";
import { Channel, Event, Member, Message, Server, User } from "./models";
import { clearVoiceChannel, emitToServer, onlineAmong, realtime, serverRoom, subscribeUserToServer, voiceSnapshot } from "./realtime";
import { toChannel, toMember, toServer, toUser } from "./serialize";

const newInviteCode = () => crypto.randomBytes(6).toString("base64url");

export async function listServers(userId: Types.ObjectId): Promise<ServerDTO[]> {
  const memberships = await Member.find({ user: userId }).sort({ createdAt: 1 }).lean();
  const servers = await Server.find({ _id: { $in: memberships.map((m) => m.server) } }).lean();
  const byId = new Map(servers.map((s) => [String(s._id), s]));
  return memberships.flatMap((m) => {
    const s = byId.get(String(m.server));
    return s ? [toServer(s, m.role as Role)] : [];
  });
}

export async function getServerDetail(serverId: string, userId: Types.ObjectId): Promise<ServerDetailDTO> {
  const member = await requireMember(serverId, userId);
  const server = await Server.findById(serverId).lean();
  if (!server) throw new HttpError(404, "سرور پیدا نشد");

  const [channels, members, events] = await Promise.all([
    Channel.find({ server: serverId }).sort({ position: 1, createdAt: 1 }).lean(),
    Member.find({ server: serverId }).lean(),
    listEvents(serverId),
  ]);
  const users = await User.find({ _id: { $in: members.map((m) => m.user) } }).lean();
  const usersById = new Map(users.map((u) => [String(u._id), u]));

  return {
    server: toServer(server, member.role as Role),
    channels: channels.map(toChannel),
    members: members.flatMap((m): MemberDTO[] => {
      const u = usersById.get(String(m.user));
      return u ? [toMember(m, u)] : [];
    }),
    voice: voiceSnapshot(channels.filter((c) => c.type === "voice").map((c) => String(c._id))),
    online: onlineAmong(members.map((m) => String(m.user))),
    events,
  };
}

export async function createServer(name: string, ownerId: Types.ObjectId) {
  const server = await Server.create({ name, owner: ownerId, inviteCode: newInviteCode() });
  await Member.create({ server: server._id, user: ownerId, role: "owner" });
  await Channel.create([
    { server: server._id, name: "عمومی", type: "text", position: 0 },
    { server: server._id, name: "اتاق صوتی", type: "voice", position: 1 },
  ]);
  subscribeUserToServer(String(ownerId), String(server._id));
  return toServer(server, "owner");
}

export async function findServerByInvite(code: string) {
  return Server.findOne({ inviteCode: code.trim() }).lean();
}

export async function joinServer(code: string, user: { _id: Types.ObjectId; name: string; color: string; phone: string }) {
  const server = await findServerByInvite(code);
  if (!server) throw new HttpError(404, "کد دعوت معتبر نیست");

  const existing = await Member.findOne({ server: server._id, user: user._id }).lean();
  if (!existing) {
    await Member.create({ server: server._id, user: user._id, role: "member" });
    emitToServer(String(server._id), "member:new", {
      serverId: String(server._id),
      member: { user: toUser(user), role: "member", mutedUntil: null } satisfies MemberDTO,
    });
  }
  subscribeUserToServer(String(user._id), String(server._id));
  if (!existing) announceJoin(String(server._id), String(user._id));
  return toServer(server, (existing?.role as Role) ?? "member");
}

/** Tell everyone in the server that its name or invite link changed. */
function broadcastServer(server: { _id: Types.ObjectId; name: string; inviteCode: string }) {
  emitToServer(String(server._id), "server:update", { id: String(server._id), name: server.name, inviteCode: server.inviteCode });
}

export async function renameServer(serverId: string, name: string) {
  const server = await Server.findByIdAndUpdate(serverId, { name }, { new: true }).lean();
  if (!server) throw new HttpError(404, "سرور پیدا نشد");
  broadcastServer(server);
  return server;
}

/** The old link stops working at once; people already inside are unaffected. */
export async function renewInvite(serverId: string) {
  const server = await Server.findByIdAndUpdate(serverId, { inviteCode: newInviteCode() }, { new: true }).lean();
  if (!server) throw new HttpError(404, "سرور پیدا نشد");
  broadcastServer(server);
  return server;
}

/** The owner becomes an admin and the chosen member takes over. */
export async function transferOwnership(serverId: string, currentOwner: Types.ObjectId, newOwnerId: string) {
  const target = await Member.findOne({ server: serverId, user: newOwnerId });
  if (!target) throw new HttpError(404, "این کاربر عضو سرور نیست");
  if (String(target.user) === String(currentOwner)) throw new HttpError(400, "شما همین الان مالک سرور هستید");

  // The server's own record is the source of truth; roles follow it.
  const claimed = await Server.updateOne({ _id: serverId, owner: currentOwner }, { owner: target.user });
  if (!claimed.modifiedCount) throw new HttpError(409, "مالکیت سرور تغییر کرده است. صفحه را تازه کنید");

  target.role = "owner";
  target.mutedUntil = null;
  await target.save();
  const previous = await Member.findOneAndUpdate({ server: serverId, user: currentOwner }, { role: "admin" }, { new: true });

  const users = await User.find({ _id: { $in: [target.user, currentOwner] } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  for (const m of [target, previous]) {
    const user = m && byId.get(String(m.user));
    if (m && user) emitToServer(serverId, "member:update", { serverId, member: toMember(m, user) });
  }
  return toMember(target, byId.get(String(target.user))!);
}

/** Removes the server and everything in it, and sends every member's open screens back to their other servers. */
export async function deleteServer(serverId: string) {
  const channels = await Channel.find({ server: serverId }, { _id: 1, type: 1 }).lean();
  const channelIds = channels.map((c) => c._id);

  // Tell people first: once the members are gone there is no one left to address.
  const room = realtime.io?.in(serverRoom(serverId));
  room?.emit("server:removed", { serverId, kicked: false, deleted: true });
  room?.socketsLeave(serverRoom(serverId));

  const voiceIds = channels.filter((c) => c.type === "voice").map((c) => String(c._id));
  for (const id of voiceIds) clearVoiceChannel(serverId, id);
  await closeVoiceRooms(voiceIds);

  await Promise.all([
    Message.deleteMany({ channel: { $in: channelIds } }),
    Channel.deleteMany({ server: serverId }),
    Member.deleteMany({ server: serverId }),
    Event.deleteMany({ server: serverId }),
  ]);
  await Server.deleteOne({ _id: serverId });
}
