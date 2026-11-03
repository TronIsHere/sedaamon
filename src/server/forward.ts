import type { Types } from "mongoose";
import type { ForwardTargetsDTO } from "@/lib/types";
import { memberCanView } from "./access";
import { openDm, listDms } from "./dms";
import { listFriends } from "./friends";
import { assertCanWrite, assertId, HttpError, requireMessageScope, type MessageScope } from "./http";
import { serializeMessage } from "./messages";
import { Channel, Member, Message, Server, User } from "./models";

const DM_SOURCE = "پیام مستقیم";

/** «سرور · #کانال» for a channel, or «پیام مستقیم». Looked up only when a message is actually forwarded. */
async function sourceLabel(channelId: string, scope: MessageScope) {
  if (scope.isDm) return DM_SOURCE;
  const channel = await Channel.findById(channelId, { name: 1 }).lean();
  const server = await Server.findById(scope.serverId, { name: 1 }).lean();
  return `${server?.name ?? ""} · #${channel?.name ?? ""}`;
}

/**
 * Copies a message into another channel or direct conversation, carrying an "originally from" note.
 * The writer must be able to read the original and write at the destination. Pings are not carried over,
 * and forwarding a forwarded message keeps pointing at the first author rather than at the forwarder.
 */
export async function forwardMessage(
  user: { _id: Types.ObjectId },
  sourceId: string,
  messageId: string,
  target: { channelId?: string; userId?: string },
) {
  const source = await requireMessageScope(sourceId, user._id);
  const original = await Message.findOne({ _id: assertId(messageId), channel: sourceId }).lean();
  if (!original) throw new HttpError(404, "پیام پیدا نشد");

  const targetId = target.userId ? (await openDm(user._id, target.userId)).id : target.channelId;
  if (!targetId) throw new HttpError(400, "مقصد را انتخاب کنید");
  if (targetId === sourceId) throw new HttpError(400, "پیام را در همین گفت‌وگو نمی‌توان دوباره فرستاد");

  const dest = await requireMessageScope(targetId, user._id);
  if (dest.type === "voice") throw new HttpError(400, "این کانال متنی نیست");
  assertCanWrite(dest.member);

  let forwardedFrom = original.forwardedFrom ?? null;
  if (!forwardedFrom) {
    const author = await User.findById(original.author, { name: 1 }).lean();
    forwardedFrom = { author: original.author, authorName: author?.name ?? "", source: await sourceLabel(sourceId, source) };
  }

  const doc = await Message.create({
    channel: targetId,
    author: user._id,
    content: original.content,
    sticker: original.sticker ?? null,
    forwardedFrom,
  });
  const message = await serializeMessage(doc.toObject());
  await dest.touch();
  dest.emit("message:new", { ...message, serverId: dest.serverId });
  return message;
}

/** Every place this person can forward to: writable text channels of their servers, and people they may message. */
export async function listForwardTargets(userId: Types.ObjectId): Promise<ForwardTargetsDTO> {
  const memberships = await Member.find({ user: userId }).lean();
  const [servers, channels] = await Promise.all([
    Server.find({ _id: { $in: memberships.map((m) => m.server) } }, { name: 1 }).lean(),
    Channel.find({ server: { $in: memberships.map((m) => m.server) }, type: "text" }).sort({ position: 1, createdAt: 1 }).lean(),
  ]);
  const memberOf = new Map(memberships.map((m) => [String(m.server), m]));
  const now = Date.now();

  const groups = servers.flatMap((s) => {
    const member = memberOf.get(String(s._id));
    // Muted people and those who haven't accepted the rules can't write there, so there is no point offering it.
    if (!member || member.rulesPending || (member.mutedUntil && member.mutedUntil.getTime() > now)) return [];
    const list = channels.filter((c) => String(c.server) === String(s._id) && memberCanView(c, member)).map((c) => ({ id: String(c._id), name: c.name }));
    return list.length ? [{ id: String(s._id), name: s.name, channels: list }] : [];
  });

  const [dms, friends] = await Promise.all([listDms(userId), listFriends(userId)]);
  const seen = new Set<string>();
  const people = [...dms.conversations.map((c) => c.peer), ...friends.friends].filter((u) => !seen.has(u.id) && seen.add(u.id));
  return { servers: groups, people };
}
