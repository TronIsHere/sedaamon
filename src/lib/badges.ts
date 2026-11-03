import type { BadgeId } from "./types";

export interface BadgeInfo {
  id: BadgeId;
  title: string;
  description: string;
  /** Emblem under /public/badges. */
  src: string;
}

export const BADGES: Record<BadgeId, BadgeInfo> = {
  newcomer: {
    id: "newcomer",
    title: "عضو جدید",
    description: "تازه به این سرور پیوسته؛ تا یک هفته پس از پیوستن نمایش داده می‌شود",
    src: "/badges/newcomer.png",
  },
  rule_keeper: {
    id: "rule_keeper",
    title: "پایبند به قوانین",
    description: "قوانین این سرور را خوانده و پذیرفته است",
    src: "/badges/rule-keeper.png",
  },
  explorer: {
    id: "explorer",
    title: "کاوشگر",
    description: "این سرور را از راه فهرست سرورهای عمومی پیدا کرده و به آن پیوسته است",
    src: "/badges/explorer.png",
  },
};

/** How long a person counts as new to a server. */
export const NEWCOMER_DAYS = 7;
export const NEWCOMER_MS = NEWCOMER_DAYS * 24 * 60 * 60_000;

/** Badges in the order they are listed. */
export const BADGE_ORDER: BadgeId[] = ["newcomer", "rule_keeper", "explorer"];
