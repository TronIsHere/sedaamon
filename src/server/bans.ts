import type { Types } from "mongoose";
import { canModerate, NO_STANDING, type Standing } from "@/lib/permissions";
import type { BanDTO } from "@/lib/types";
import { HttpError } from "./errors";
import { removeFromVoice } from "./livekit";
import { Channel, Member, ServerBan, User } from "./models";
import { emitToServer, realtime, serverRoom, userRoom } from "./realtime";
import { memberStanding, serverRoles } from "./roles";
import { toUser } from "./serialize";

type Id = Types.ObjectId | string;

/**
 * Takes someone out of a server: their membership, their seat in its voice rooms, and its live events on their screens.
 * `how` tells their screens why: they left, were kicked, or were banned.
 */
export async function removeMember(serverId: string, userId: string, how: "left" | "kicked" | "banned") {
  await Member.deleteOne({ server: serverId, user: userId });
  emitToServer(serverId, "member:remove", { serverId, userId });
  const sockets = realtime.io?.in(userRoom(userId));
  sockets?.socketsLeave(serverRoom(serverId));
  sockets?.emit("server:removed", { serverId, kicked: how !== "left", banned: how === "banned" });

  // Someone removed mid-call shouldn't keep talking in a room they can no longer see.
  const voice = await Channel.find({ server: serverId, type: "voice" }, { _id: 1 }).lean();
  const inRoom = voice.map((c) => String(c._id)).filter((id) => realtime.voice.get(id)?.has(userId));
  await removeFromVoice(inRoom.map((id) => [id, [userId]]));
}

export const isBanned = async (serverId: Id, userId: Id) => !!(await ServerBan.exists({ server: serverId, user: userId }));

/** Bans someone (a member, or someone who already left) and removes them if they're still inside. Only downwards, like any moderation. */
export async function banUser(serverId: string, actor: { _id: Types.ObjectId; standing: Standing }, userId: string, reason: string) {
  if (String(actor._id) === userId) throw new HttpError(400, "این کار روی خودتان ممکن نیست");
  const [target, user] = await Promise.all([Member.findOne({ server: serverId, user: userId }).lean(), User.exists({ _id: userId })]);
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  const theirs = target ? memberStanding(target, await serverRoles(serverId)) : NO_STANDING;
  if (!canModerate(actor.standing, theirs)) throw new HttpError(403, "نمی‌توانید این عضو را مسدود کنید");

  await ServerBan.updateOne(
    { server: serverId, user: userId },
    { by: actor._id, reason: reason.trim().slice(0, 200) },
    { upsert: true },
  );
  if (target) await removeMember(serverId, userId, "banned");
}

export async function unbanUser(serverId: string, userId: string) {
  const { deletedCount } = await ServerBan.deleteOne({ server: serverId, user: userId });
  if (!deletedCount) throw new HttpError(404, "این کاربر مسدود نیست");
}

export async function listBans(serverId: string): Promise<BanDTO[]> {
  const rows = await ServerBan.find({ server: serverId }).sort({ createdAt: -1 }).limit(500).lean();
  const users = await User.find({ _id: { $in: [...rows.map((r) => r.user), ...rows.map((r) => r.by)] } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows.flatMap((r): BanDTO[] => {
    const user = byId.get(String(r.user));
    if (!user) return [];
    const by = byId.get(String(r.by));
    return [{ user: toUser(user), by: by ? toUser(by) : null, reason: r.reason ?? "", createdAt: r.createdAt.toISOString() }];
  });
}
