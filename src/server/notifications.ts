import type { Types } from "mongoose";
import { messageSummary } from "@/lib/attachments";
import type { NotificationDTO, NotificationKind } from "@/lib/types";
import { EVERYONE, findMentions, hasMention } from "@/lib/mentions";
import { can } from "@/lib/permissions";
import type { MessageScope } from "./http";
import { Channel, Member, Notification, Server, User } from "./models";
import type { MessageDoc } from "./messages";
import { emitToUsers } from "./realtime";
import { toUser } from "./serialize";

const PREVIEW_LENGTH = 120;
const KEEP_MS = 14 * 24 * 60 * 60_000;
const MAX_MENTIONS = 20;

/**
 * Works out who a new message pings. `ids` are the people the writer picked from the "@" menu; each one only
 * counts if they belong to the server and their "@name" is still in the text. Direct messages have no pings.
 */
export async function resolveMentions(scope: MessageScope, authorId: Types.ObjectId, text: string, ids: string[]) {
  if (scope.isDm) return { mentions: [] as Types.ObjectId[], everyone: false };
  const everyone = can(scope.member.standing, "message:mention_everyone") && hasMention(text, EVERYONE);

  // Someone who can't see a private channel can't be pinged in it.
  const wanted = [...new Set(ids)].filter((id) => id !== String(authorId) && (!scope.audience || scope.audience.has(id))).slice(0, MAX_MENTIONS);
  if (!wanted.length) return { mentions: [], everyone };
  const members = await Member.find({ server: scope.serverId, user: { $in: wanted } }, { user: 1 }).lean();
  const users = await User.find({ _id: { $in: members.map((m) => m.user) } }, { name: 1 }).lean();
  return { mentions: users.filter((u) => hasMention(text, u.name)).map((u) => u._id), everyone };
}

/** After an edit: keeps the pings whose "@name" survived. Editing never adds new ones. */
export async function keepMentions(existing: Pick<MessageDoc, "mentions" | "mentionEveryone">, text: string) {
  const ids = existing.mentions ?? [];
  const users = ids.length ? await User.find({ _id: { $in: ids } }, { name: 1 }).lean() : [];
  return {
    mentions: users.filter((u) => findMentions(text, [u.name]).length).map((u) => u._id),
    mentionEveryone: !!existing.mentionEveryone && hasMention(text, EVERYONE),
  };
}

/** Turns notification rows into DTOs. Rows whose channel or server is gone are left out. */
export async function serializeNotifications(
  rows: {
    _id: Types.ObjectId;
    kind: string;
    server: Types.ObjectId;
    channel: Types.ObjectId;
    message: Types.ObjectId;
    author: Types.ObjectId;
    preview?: string | null;
    readAt?: Date | null;
    createdAt: Date;
  }[],
): Promise<NotificationDTO[]> {
  const unique = (ids: Types.ObjectId[]) => [...new Set(ids.map(String))];
  const [servers, channels, authors] = await Promise.all([
    Server.find({ _id: { $in: unique(rows.map((r) => r.server)) } }, { name: 1 }).lean(),
    Channel.find({ _id: { $in: unique(rows.map((r) => r.channel)) } }, { name: 1 }).lean(),
    User.find({ _id: { $in: unique(rows.map((r) => r.author)) } }).lean(),
  ]);
  const serverName = new Map(servers.map((s) => [String(s._id), s.name]));
  const channelName = new Map(channels.map((c) => [String(c._id), c.name]));
  const authorById = new Map(authors.map((a) => [String(a._id), a]));

  return rows.flatMap((r): NotificationDTO[] => {
    const server = serverName.get(String(r.server));
    const channel = channelName.get(String(r.channel));
    const author = authorById.get(String(r.author));
    if (server === undefined || channel === undefined || !author) return [];
    return [
      {
        id: String(r._id),
        kind: r.kind as NotificationKind,
        serverId: String(r.server),
        serverName: server,
        channelId: String(r.channel),
        channelName: channel,
        messageId: String(r.message),
        author: toUser(author),
        preview: r.preview ?? "",
        createdAt: r.createdAt.toISOString(),
        read: !!r.readAt,
      },
    ];
  });
}

/**
 * Records and pushes a ping for everyone a new message reaches. One person gets one notification per message:
 * being named beats being reached by @everyone, which beats being replied to.
 */
export async function notifyPings(
  scope: MessageScope,
  message: MessageDoc,
  ping: { mentions: Types.ObjectId[]; everyone: boolean; replyAuthor: Types.ObjectId | null },
) {
  if (scope.isDm) return;
  const author = String(message.author);
  const kinds = new Map<string, NotificationKind>();
  if (ping.replyAuthor) kinds.set(String(ping.replyAuthor), "reply");
  if (ping.everyone) {
    const members = await Member.find({ server: scope.serverId }, { user: 1 }).lean();
    for (const m of members) if (!scope.audience || scope.audience.has(String(m.user))) kinds.set(String(m.user), "everyone");
  }
  for (const id of ping.mentions) kinds.set(String(id), "mention");
  kinds.delete(author);
  if (!kinds.size) return;

  // A reply only pings someone who is still in the server, and still allowed to see the channel.
  if (ping.replyAuthor && kinds.get(String(ping.replyAuthor)) === "reply") {
    const stillMember = await Member.exists({ server: scope.serverId, user: ping.replyAuthor });
    if (!stillMember || (scope.audience && !scope.audience.has(String(ping.replyAuthor)))) kinds.delete(String(ping.replyAuthor));
  }

  const preview = messageSummary(message.content, message.attachments).slice(0, PREVIEW_LENGTH);
  const docs = await Notification.insertMany(
    [...kinds].map(([user, kind]) => ({
      user,
      kind,
      message: message._id,
      channel: message.channel,
      server: scope.serverId,
      author: message.author,
      preview,
      expiresAt: new Date(Date.now() + KEEP_MS),
    })),
  );
  for (const doc of docs) {
    const [dto] = await serializeNotifications([doc.toObject()]);
    if (dto) emitToUsers([String(doc.user)], "notification:new", dto);
  }
}
