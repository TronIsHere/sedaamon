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
  /** In Seda Points; packs with a price are bought in the store (lib/store) before they can be sent. */
  price?: number;
}

type Def = Omit<Sticker, "id"> & { name: string };

const pack = (id: string, name: string, style: StickerStyle, defs: Def[], price?: number): StickerPack => ({
  id,
  name,
  style,
  stickers: defs.map(({ name: n, ...s }) => ({ id: `${id}/${n}`, ...s })),
  ...(price && { price }),
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
  pack(
    "gamer",
    "گیمری",
    "phrase",
    [
      { name: "yedastdige", text: "یه دست دیگه", emoji: "🎮", bg: "#7c3aed", fg: "#f5f3ff" },
      { name: "lag", text: "لگ دارم", emoji: "🐢", bg: "#475569", fg: "#f8fafc" },
      { name: "camp", text: "کمپ نکن!", emoji: "⛺", bg: "#65a30d", fg: "#f7fee7" },
      { name: "headshot", text: "هدشات", emoji: "🎯", bg: "#dc2626", fg: "#fef2f2" },
      { name: "gg", text: "جی‌جی", emoji: "🏆", bg: "#ca8a04", fg: "#1c1917" },
      { name: "bakhtim", text: "باختیم رفت", emoji: "💀", bg: "#18181b", fg: "#e4e4e7" },
      { name: "kari", text: "کری نخون", emoji: "🤫", bg: "#0891b2", fg: "#ecfeff" },
      { name: "berimbala", text: "بریم بالا", emoji: "🚀", bg: "#2563eb", fg: "#eff6ff" },
      { name: "noob", text: "نوب", emoji: "🍼", bg: "#f9a8d4", fg: "#500724" },
      { name: "online", text: "آنلاین شو", emoji: "📶", bg: "#16a34a", fg: "#f0fdf4" },
      { name: "revive", text: "بیا رسپاونم کن", emoji: "🧟", bg: "#4d7c0f", fg: "#f7fee7" },
      { name: "afk", text: "یه دقه AFK", emoji: "☕", bg: "#92400e", fg: "#fffbeb" },
    ],
    120,
  ),
  pack(
    "delbar",
    "دلبرانه",
    "phrase",
    [
      { name: "deltang", text: "دلم برات تنگه", emoji: "🥺", bg: "#db2777", fg: "#fdf2f8" },
      { name: "eshghami", text: "عشقمی", emoji: "💖", bg: "#e11d48", fg: "#fff1f2" },
      { name: "fadat", text: "فدات شم", emoji: "😘", bg: "#f43f5e", fg: "#fff1f2" },
      { name: "baghal", text: "بغل", emoji: "🤗", bg: "#f59e0b", fg: "#1c1917" },
      { name: "gol", text: "گل تقدیم شما", emoji: "🌹", bg: "#9f1239", fg: "#ffe4e6" },
      { name: "khoshgel", text: "خوشگلم", emoji: "✨", bg: "#a855f7", fg: "#faf5ff" },
      { name: "hasood", text: "حسودیم شد", emoji: "😤", bg: "#16a34a", fg: "#f0fdf4" },
      { name: "ghahr", text: "قهرم", emoji: "😒", bg: "#64748b", fg: "#f8fafc" },
      { name: "ashti", text: "آشتی؟", emoji: "🤝", bg: "#0ea5e9", fg: "#f0f9ff" },
      { name: "shabkhosh", text: "شبت خوش عزیزم", emoji: "🌙", bg: "#312e81", fg: "#e0e7ff" },
      { name: "dooset", text: "دوستت دارم", emoji: "❤️", bg: "#be123c", fg: "#fff1f2" },
      { name: "kojaei", text: "کجایی عشقم؟", emoji: "👀", bg: "#7c3aed", fg: "#f5f3ff" },
    ],
    100,
  ),
  pack(
    "shahaneh",
    "شاهانه",
    "ornament",
    [
      { name: "mobarake", text: "مبارکه", bg: "#0c0a09", fg: "#fbbf24" },
      { name: "sepas", text: "سپاس", bg: "#0c0a09", fg: "#fcd34d" },
      { name: "piruz", text: "پیروز باشید", bg: "#1c1917", fg: "#fbbf24" },
      { name: "khodaghovat", text: "خدا قوت", bg: "#14532d", fg: "#fde68a" },
      { name: "safa", text: "صفا آوردید", bg: "#172554", fg: "#fde68a" },
      { name: "salenow", text: "سال نو مبارک", bg: "#7f1d1d", fg: "#fde68a" },
      { name: "eid", text: "عیدتون مبارک", bg: "#4c1d95", fg: "#fde68a" },
      { name: "sarboland", text: "سربلند باشید", bg: "#0c0a09", fg: "#fde68a" },
      { name: "eltemas", text: "التماس دعا", bg: "#134e4a", fg: "#ccfbf1" },
      { name: "ghadam", text: "قدم‌رنجه کردید", bg: "#3f3f46", fg: "#fde68a" },
      { name: "aali", text: "عالی بود", bg: "#78350f", fg: "#fef3c7" },
      { name: "tabrik", text: "تبریک", bg: "#0c0a09", fg: "#fbbf24" },
    ],
    150,
  ),
];

const byId = new Map(STICKER_PACKS.flatMap((p) => p.stickers.map((s) => [s.id, { sticker: s, pack: p }] as const)));

export const findSticker = (id: string) => byId.get(id);
