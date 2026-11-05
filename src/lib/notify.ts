import type { NotifyLevel, NotifySettingDTO } from "./types";

/** "Until I turn it back on" is stored as a mute that ends far in the future. */
export const MUTED_FOREVER = "9999-12-31T00:00:00.000Z";

/** The mute lengths offered in the menus; null is "until I turn it back on". */
export const MUTE_CHOICES: { minutes: number | null; label: string }[] = [
  { minutes: 60, label: "۱ ساعت" },
  { minutes: 8 * 60, label: "۸ ساعت" },
  { minutes: 24 * 60, label: "۲۴ ساعت" },
  { minutes: null, label: "تا وقتی دوباره روشن کنم" },
];

export const LEVEL_LABELS: Record<NotifyLevel, string> = {
  all: "همهٔ پیام‌ها",
  mentions: "فقط وقتی صدایم بزنند",
};

/** target id → that target's setting. */
export type NotifySettings = Record<string, NotifySettingDTO>;

export const isMutedUntil = (until: string | null | undefined, now = Date.now()) => !!until && new Date(until).getTime() > now;

export const mutedForever = (until: string | null | undefined) => !!until && new Date(until).getFullYear() >= 9999;

/** What actually applies to one channel: its own choice, else its server's, else every message; a mute on either silences it. */
export function effectiveNotify(settings: NotifySettings, channelId: string, serverId: string | null, now = Date.now()) {
  const channel = settings[channelId];
  const server = serverId ? settings[serverId] : undefined;
  const channelMuted = isMutedUntil(channel?.mutedUntil, now);
  const serverMuted = isMutedUntil(server?.mutedUntil, now);
  return {
    level: (channel?.level ?? server?.level ?? "all") as NotifyLevel,
    muted: channelMuted || serverMuted,
    /** Whose mute it is, to say so in the menu. */
    mutedBy: channelMuted ? ("channel" as const) : serverMuted ? ("server" as const) : null,
  };
}

export type EffectiveNotify = ReturnType<typeof effectiveNotify>;

/** Whether a new message should pop up a toast or a system notification. */
export const shouldAlert = (e: EffectiveNotify, pinged: boolean) => !e.muted && (pinged || e.level === "all");

/** Whether ordinary (non-ping) unread messages count toward badges. Pings always do, quietly, even when muted. */
export const countsUnread = (e: EffectiveNotify) => !e.muted && e.level === "all";

/** When a mute of `minutes` (null: until turned back on) would end. */
export const muteEnd = (minutes: number | null, now = Date.now()) => (minutes === null ? MUTED_FOREVER : new Date(now + minutes * 60_000).toISOString());
