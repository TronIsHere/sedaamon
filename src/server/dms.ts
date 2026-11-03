import type { Types } from "mongoose";
import type { DmDTO, DmListDTO } from "@/lib/types";
import { assertId, HttpError } from "./http";
import { friendState, mutualServers } from "./friends";
import { Conversation, User } from "./models";
import { onlineAmong } from "./realtime";
import { toUser } from "./serialize";

type Id = Types.ObjectId | string;

const keyOf = (a: Id, b: Id) => [String(a), String(b)].sort().join(":");

/** Opens the conversation with someone, creating it the first time. Only people who share a server or a friendship can write to each other. */
export async function openDm(me: Id, peerId: string): Promise<DmDTO> {
  assertId(peerId);
  if (String(me) === peerId) throw new HttpError(400, "نمی‌توانید به خودتان پیام بدهید");
  const peer = await User.findById(peerId).lean();
  if (!peer) throw new HttpError(404, "کاربر پیدا نشد");

  const key = keyOf(me, peerId);
  let conversation = await Conversation.findOne({ key }).lean();
  if (!conversation) {
    const allowed = (await friendState(me, peerId)) === "friends" || (await mutualServers(me, peerId)).length > 0;
    if (!allowed) throw new HttpError(403, "فقط به اعضای سرورهای مشترک یا دوستانتان می‌توانید پیام بدهید");
    try {
      conversation = (await Conversation.create({ key, participants: [me, peerId] })).toObject();
    } catch (err) {
      // Both people opened it at the same moment; the first insert won.
      if ((err as { code?: number }).code !== 11000) throw err;
      conversation = await Conversation.findOne({ key }).lean();
    }
  }
  return { id: String(conversation!._id), peer: toUser(peer), lastMessageAt: conversation!.lastMessageAt?.toISOString() ?? null };
}

/** Conversations that have at least one message, newest first. Empty ones stay out until someone writes. */
export async function listDms(me: Id): Promise<DmListDTO> {
  const rows = await Conversation.find({ participants: me, lastMessageAt: { $ne: null } }).sort({ lastMessageAt: -1 }).limit(100).lean();
  const peerOf = (c: (typeof rows)[number]) => c.participants.find((p) => String(p) !== String(me)) ?? c.participants[0];
  const peers = await User.find({ _id: { $in: rows.map(peerOf) } }).lean();
  const byId = new Map(peers.map((u) => [String(u._id), u]));
  const conversations = rows.flatMap((c): DmDTO[] => {
    const peer = byId.get(String(peerOf(c)));
    return peer ? [{ id: String(c._id), peer: toUser(peer), lastMessageAt: c.lastMessageAt?.toISOString() ?? null }] : [];
  });
  return { conversations, online: onlineAmong(conversations.map((c) => c.peer.id)) };
}
