import { describe, expect, it } from "vitest";
import { EVERYONE, findMentions, hasMention, mentionNames, pingsUser } from "./mentions";
import type { MessageDTO, UserDTO } from "./types";

const user = (id: string, name = id): UserDTO => ({ id, name, color: "#38bdf8", avatar: null }) as UserDTO;

type Pingable = Pick<MessageDTO, "mentions" | "mentionEveryone" | "replyTo" | "author">;
const message = (over: Partial<Pingable> = {}): Pingable => ({
  author: user("author"),
  mentions: [],
  mentionEveryone: false,
  replyTo: null,
  ...over,
});

describe("findMentions", () => {
  it("finds a name written after @", () => {
    expect(findMentions("سلام @علی خوبی؟", ["علی"])).toEqual([{ start: 5, end: 9 }]);
  });

  it("needs the name to start and end a word", () => {
    expect(hasMention("@Alice hi", "Ali")).toBe(false);
    expect(hasMention("mail@Ali", "Ali")).toBe(false);
    expect(hasMention("hi @Ali!", "Ali")).toBe(true);
  });

  it("prefers the longest name, so names with spaces work", () => {
    const spans = findMentions("@Ali Reza hello", ["Ali", "Ali Reza"]);
    expect(spans).toEqual([{ start: 0, end: 9 }]);
  });

  it("finds every mention in the text", () => {
    expect(findMentions("@a and @b", ["a", "b"])).toHaveLength(2);
  });

  it("finds nothing without names", () => {
    expect(findMentions("@someone", [])).toEqual([]);
  });
});

describe("mentionNames", () => {
  it("lists the named people and everyone", () => {
    expect(mentionNames({ mentions: [{ id: "1", name: "Sara" }], mentionEveryone: true })).toEqual(["Sara", EVERYONE]);
  });
});

describe("pingsUser", () => {
  it("is true when named, reached by everyone, or replied to", () => {
    expect(pingsUser(message({ mentions: [{ id: "me", name: "Me" }] }), "me")).toBe(true);
    expect(pingsUser(message({ mentionEveryone: true }), "me")).toBe(true);
    expect(pingsUser(message({ replyTo: { id: "m1", deleted: false, content: "", author: user("me") } }), "me")).toBe(true);
  });

  it("is false for a reply to a deleted message, someone else, or your own message", () => {
    expect(pingsUser(message({ replyTo: { id: "m1", deleted: true, content: "", author: null } }), "me")).toBe(false);
    expect(pingsUser(message({ mentions: [{ id: "other", name: "Other" }] }), "me")).toBe(false);
    expect(pingsUser(message({ author: user("me"), mentionEveryone: true }), "me")).toBe(false);
  });
});
