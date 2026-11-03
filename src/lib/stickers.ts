/**
 * Built-in sticker packs. They ship with the app (nothing is fetched from elsewhere), so they work on any network.
 * A sticker message stores the sticker's id; its `text` is saved as the message content, so previews, replies,
 * notifications and search read naturally.
 *
 * A sticker is drawn from its text and colors, or from `src` when it is a picture placed under /public/stickers.
 */

export type StickerStyle = "phrase" | "ornament";

export interface Sticker {
  /** "<pack>/<name>", stored on the message. */
  id: string;
  text: string;
  emoji?: string;
  /** Background and text colors. */
  bg: string;
  fg: string;
  /** A picture under /public, used instead of the drawn sticker. */
  src?: string;
}

export interface StickerPack {
  id: string;
  name: string;
  style: StickerStyle;
  stickers: Sticker[];
}

type Def = Omit<Sticker, "id"> & { name: string };

const pack = (id: string, name: string, style: StickerStyle, defs: Def[]): StickerPack => ({
  id,
  name,
  style,
  stickers: defs.map(({ name: n, ...s }) => ({ id: `${id}/${n}`, ...s })),
});

export const STICKER_PACKS: StickerPack[] = [
  pack("harf", "حرف حساب", "phrase", [
    { name: "dametgarm", text: "دمت گرم", emoji: "🔥", bg: "#f97316", fg: "#fff7ed" },
    { name: "eybaba", text: "ای بابا", emoji: "🤦", bg: "#64748b", fg: "#f8fafc" },
    { name: "khastenabashi", text: "خسته نباشی", emoji: "💪", bg: "#0ea5e9", fg: "#f0f9ff" },
    { name: "chakerim", text: "چاکریم", emoji: "🙏", bg: "#8b5cf6", fg: "#f5f3ff" },
    { name: "ghorboonet", text: "قربونت برم", emoji: "😍", bg: "#ec4899", fg: "#fdf2f8" },
    { name: "jeddi", text: "جدی؟!", emoji: "😳", bg: "#eab308", fg: "#1c1917" },
    { name: "bikhial", text: "بی‌خیال", emoji: "😌", bg: "#14b8a6", fg: "#f0fdfa" },
    { name: "nooshejan", text: "نوش جان", emoji: "😋", bg: "#84cc16", fg: "#1a2e05" },
    { name: "ajab", text: "عجب!", emoji: "🤯", bg: "#ef4444", fg: "#fef2f2" },
    { name: "eyval", text: "ایول", emoji: "👏", bg: "#22c55e", fg: "#f0fdf4" },
    { name: "mordam", text: "مُردم از خنده", emoji: "😂", bg: "#f59e0b", fg: "#1c1917" },
    { name: "dastkhosh", text: "دستت درد نکنه", emoji: "🌹", bg: "#be123c", fg: "#fff1f2" },
    { name: "kojaei", text: "کجایی پس؟", emoji: "👀", bg: "#6366f1", fg: "#eef2ff" },
    { name: "hamintor", text: "همین‌طوری", emoji: "🤷", bg: "#a855f7", fg: "#faf5ff" },
    { name: "shabbekheir", text: "شب بخیر", emoji: "🌙", bg: "#1e3a8a", fg: "#dbeafe" },
    { name: "sobhbekheir", text: "صبح بخیر", emoji: "☀️", bg: "#fbbf24", fg: "#451a03" },
  ]),
  pack("tazhib", "تذهیب", "ornament", [
    { name: "salam", text: "سلام", bg: "#0f766e", fg: "#fde68a" },
    { name: "mamnoon", text: "ممنونم", bg: "#1e3a8a", fg: "#fde68a" },
    { name: "mobarak", text: "مبارک باد", bg: "#9f1239", fg: "#fde68a" },
    { name: "tavallod", text: "تولدت مبارک", bg: "#7c2d12", fg: "#fde68a" },
    { name: "nowruz", text: "نوروز پیروز", bg: "#166534", fg: "#fef3c7" },
    { name: "yalda", text: "یلدا مبارک", bg: "#881337", fg: "#fecdd3" },
    { name: "eshgh", text: "عشق", bg: "#831843", fg: "#fbcfe8" },
    { name: "omid", text: "امید", bg: "#155e75", fg: "#cffafe" },
    { name: "sabr", text: "صبر", bg: "#3f3f46", fg: "#e4e4e7" },
    { name: "shadbashi", text: "شاد باشی", bg: "#6d28d9", fg: "#fde68a" },
    { name: "khoshamadid", text: "خوش آمدید", bg: "#0c4a6e", fg: "#fde68a" },
    { name: "tasliat", text: "تسلیت", bg: "#18181b", fg: "#d4d4d8" },
  ]),
];

const byId = new Map(STICKER_PACKS.flatMap((p) => p.stickers.map((s) => [s.id, { sticker: s, pack: p }] as const)));

export const findSticker = (id: string) => byId.get(id);
