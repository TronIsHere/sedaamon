import type { Types } from "mongoose";
import type { MessageDTO, ReactionDTO, ReplyDTO } from "@/lib/types";
import { Message, User } from "./models";
import { toUser } from "./serialize";

export interface MessageDoc {
  _id: Types.ObjectId;
  channel: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  createdAt: Date;
  editedAt?: Date | null;
  pinnedAt?: Date | null;
  sticker?: string | null;
  forwardedFrom?: { author?: Types.ObjectId | null; authorName?: string | null; source?: string | null } | null;
  replyTo?: Types.ObjectId | null;
  mentions?: Types.ObjectId[];
  mentionEveryone?: boolean;
  reactions?: { emoji: string; users: Types.ObjectId[] }[];
}

const PREVIEW_LENGTH = 120;

/** A channel's pin list stays short enough to read. */
export const MAX_PINS = 50;

export const toReactions = (reactions: MessageDoc["reactions"]): ReactionDTO[] =>
  (reactions ?? []).filter((r) => r.users.length).map((r) => ({ emoji: r.emoji, users: r.users.map(String) }));

/**
 * Turns message documents into DTOs, looking up every author and every replied-to message in two queries
 * rather than one per message. Messages whose author no longer exists are left out.
 */
export async function serializeMessages(docs: MessageDoc[]): Promise<MessageDTO[]> {
  const replyIds = [...new Set(docs.flatMap((m) => (m.replyTo ? [String(m.replyTo)] : [])))];
  const replied = replyIds.length
    ? await Message.find({ _id: { $in: replyIds } }, { author: 1, content: 1 }).lean()
    : [];
  const repliedById = new Map(replied.map((r) => [String(r._id), r]));

  const authorIds = new Set([
    ...docs.map((m) => String(m.author)),
    ...replied.map((r) => String(r.author)),
    ...docs.flatMap((m) => (m.mentions ?? []).map(String)),
  ]);
  const authors = await User.find({ _id: { $in: [...authorIds] } }).lean();
  const authorById = new Map(authors.map((a) => [String(a._id), a]));

  return docs.flatMap((m): MessageDTO[] => {
    const author = authorById.get(String(m.author));
    if (!author) return [];

    let replyTo: ReplyDTO | null = null;
    if (m.replyTo) {
      const target = repliedById.get(String(m.replyTo));
      const targetAuthor = target && authorById.get(String(target.author));
      replyTo =
        target && targetAuthor
          ? { id: String(target._id), deleted: false, content: target.content.slice(0, PREVIEW_LENGTH), author: toUser(targetAuthor) }
          : { id: String(m.replyTo), deleted: true, content: "", author: null };
    }

    return [
      {
        id: String(m._id),
        channelId: String(m.channel),
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt ? m.editedAt.toISOString() : null,
        forwardedFrom: m.forwardedFrom
          ? { authorId: m.forwardedFrom.author ? String(m.forwardedFrom.author) : null, authorName: m.forwardedFrom.authorName ?? "", source: m.forwardedFrom.source ?? "" }
          : null,
        pinnedAt: m.pinnedAt ? m.pinnedAt.toISOString() : null,
        sticker: m.sticker ?? null,
        author: toUser(author),
        replyTo,
        mentions: (m.mentions ?? []).flatMap((id) => {
          const user = authorById.get(String(id));
          return user ? [{ id: String(id), name: user.name }] : [];
        }),
        mentionEveryone: !!m.mentionEveryone,
        reactions: toReactions(m.reactions),
      },
    ];
  });
}

export async function serializeMessage(doc: MessageDoc) {
  return (await serializeMessages([doc]))[0];
}
