import type { MessageDTO } from "./types";

/** The name that pings every member of a server. */
export const EVERYONE = "everyone";

const WORD = /[\p{L}\p{N}_]/u;

/**
 * Where `text` writes one of `names` as "@name". A mention has to start a word and end one,
 * so "@Ali" doesn't match "@Alice" or "mail@Ali". Names can contain spaces, so the longest name wins.
 */
export function findMentions(text: string, names: string[]) {
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  const spans: { start: number; end: number }[] = [];
  if (!sorted.length) return spans;
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    if (at > 0 && WORD.test(text[at - 1])) continue;
    const name = sorted.find((n) => text.startsWith(n, at + 1) && !WORD.test(text[at + 1 + n.length] ?? " "));
    if (!name) continue;
    spans.push({ start: at, end: at + 1 + name.length });
    at += name.length;
  }
  return spans;
}

export const hasMention = (text: string, name: string) => findMentions(text, [name]).length > 0;

/** The names a message pings, as they appear after the "@". */
export const mentionNames = (m: Pick<MessageDTO, "mentions" | "mentionEveryone">) => [
  ...m.mentions.map((x) => x.name),
  ...(m.mentionEveryone ? [EVERYONE] : []),
];

/** Whether a message pings this person: named, reached by @everyone, or a reply to their message. */
export const pingsUser = (m: Pick<MessageDTO, "mentions" | "mentionEveryone" | "replyTo" | "author">, userId: string) =>
  m.author.id !== userId &&
  (m.mentionEveryone || m.mentions.some((x) => x.id === userId) || (!!m.replyTo && !m.replyTo.deleted && m.replyTo.author?.id === userId));
