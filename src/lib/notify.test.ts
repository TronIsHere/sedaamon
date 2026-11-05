import { describe, expect, it } from "vitest";
import { countsUnread, effectiveNotify, muteEnd, MUTED_FOREVER, mutedForever, shouldAlert, type NotifySettings } from "./notify";

const NOW = Date.UTC(2026, 10, 5, 12);
const later = new Date(NOW + 60 * 60_000).toISOString();
const earlier = new Date(NOW - 60_000).toISOString();

const settings = (...rows: [target: string, scope: "server" | "channel", level: "all" | "mentions" | null, mutedUntil: string | null][]): NotifySettings =>
  Object.fromEntries(rows.map(([target, scope, level, mutedUntil]) => [target, { target, scope, level, mutedUntil }]));

describe("effectiveNotify", () => {
  it("defaults to every message, unmuted", () => {
    expect(effectiveNotify({}, "c1", "s1", NOW)).toEqual({ level: "all", muted: false, mutedBy: null });
  });

  it("lets a channel follow its server, or override it", () => {
    const s = settings(["s1", "server", "mentions", null], ["c2", "channel", "all", null]);
    expect(effectiveNotify(s, "c1", "s1", NOW).level).toBe("mentions");
    expect(effectiveNotify(s, "c2", "s1", NOW).level).toBe("all");
  });

  it("is muted by either the channel or the server, and says which", () => {
    expect(effectiveNotify(settings(["c1", "channel", null, later]), "c1", "s1", NOW)).toMatchObject({ muted: true, mutedBy: "channel" });
    expect(effectiveNotify(settings(["s1", "server", null, later]), "c1", "s1", NOW)).toMatchObject({ muted: true, mutedBy: "server" });
  });

  it("forgets a mute once it has ended", () => {
    expect(effectiveNotify(settings(["c1", "channel", null, earlier]), "c1", "s1", NOW).muted).toBe(false);
  });

  it("ignores server settings for a conversation", () => {
    expect(effectiveNotify(settings(["s1", "server", null, later]), "dm1", null, NOW).muted).toBe(false);
  });
});

describe("what gets through", () => {
  const all = { level: "all" as const, muted: false, mutedBy: null };
  const mentions = { level: "mentions" as const, muted: false, mutedBy: null };
  const muted = { level: "all" as const, muted: true, mutedBy: "channel" as const };

  it("alerts for everything, only pings, or nothing", () => {
    expect(shouldAlert(all, false)).toBe(true);
    expect(shouldAlert(mentions, false)).toBe(false);
    expect(shouldAlert(mentions, true)).toBe(true);
    expect(shouldAlert(muted, true)).toBe(false);
  });

  it("counts ordinary messages only with every message on and no mute", () => {
    expect(countsUnread(all)).toBe(true);
    expect(countsUnread(mentions)).toBe(false);
    expect(countsUnread(muted)).toBe(false);
  });
});

describe("muteEnd", () => {
  it("adds minutes, or stores 'until turned back on' far ahead", () => {
    expect(muteEnd(60, NOW)).toBe(later);
    expect(muteEnd(null, NOW)).toBe(MUTED_FOREVER);
    expect(mutedForever(MUTED_FOREVER)).toBe(true);
    expect(mutedForever(later)).toBe(false);
  });
});
