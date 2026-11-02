import crypto from "node:crypto";
import type { Types } from "mongoose";
import type { MemberDTO, Role, ServerDetailDTO, ServerDTO } from "@/lib/types";
import { HttpError, requireMember } from "./http";
import { Channel, Member, Server, User } from "./models";
import { emitToServer, subscribeUserToServer, voiceSnapshot } from "./realtime";
import { toChannel, toServer, toUser } from "./serialize";

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

  const [channels, members] = await Promise.all([
    Channel.find({ server: serverId }).sort({ position: 1, createdAt: 1 }).lean(),
    Member.find({ server: serverId }).lean(),
  ]);
  const users = await User.find({ _id: { $in: members.map((m) => m.user) } }).lean();
  const usersById = new Map(users.map((u) => [String(u._id), u]));

  return {
    server: toServer(server, member.role as Role),
    channels: channels.map(toChannel),
    members: members.flatMap((m): MemberDTO[] => {
      const u = usersById.get(String(m.user));
      return u ? [{ user: toUser(u), role: m.role as Role }] : [];
    }),
    voice: voiceSnapshot(channels.filter((c) => c.type === "voice").map((c) => String(c._id))),
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
      member: { user: toUser(user), role: "member" } satisfies MemberDTO,
    });
  }
  subscribeUserToServer(String(user._id), String(server._id));
  return toServer(server, (existing?.role as Role) ?? "member");
}
