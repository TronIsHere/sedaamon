import { toPersianDigits } from "./phone";
import { STICKER_PACKS } from "./stickers";

/**
 * The store: Seda Points («صدا پوینت») are bought with a card-to-card transfer that the site admin confirms, and spent
 * on looks for your profile and on sticker packs. Everything sold here ships with the app, so it works on any network.
 */

export const POINTS_NAME = "صدا پوینت";

/** What a top-up buys. `price` is in toman; the amount actually asked for is a little more (see `uniqueAmount`). */
export interface PointsPackage {
  id: string;
  points: number;
  price: number;
  /** Shown as a ribbon on the better deals: how many more points per toman than the smallest package. */
  tag?: string;
}

export const POINTS_PACKAGES: PointsPackage[] = [
  { id: "p100", points: 100, price: 30_000 },
  { id: "p250", points: 250, price: 70_000, tag: "۷٪ بیشتر" },
  { id: "p600", points: 600, price: 150_000, tag: "۲۰٪ بیشتر" },
  { id: "p1300", points: 1300, price: 300_000, tag: "۳۰٪ بیشتر" },
];

export const findPackage = (id: string) => POINTS_PACKAGES.find((p) => p.id === id);

/**
 * Every open order asks for a slightly different sum («۳۰٬۰۲۵ تومان» for a ۳۰٬۰۰۰ package), so the admin can match a
 * transfer in the bank statement to its order by the amount alone. The extra is at most 1% of the price.
 */
export const maxExtra = (price: number) => Math.max(50, Math.floor(price / 100));

export type StoreItemKind = "frame" | "background" | "stickers";

export interface StoreItem {
  /** "<kind>:<name>", stored in the owner's inventory. */
  id: string;
  kind: StoreItemKind;
  name: string;
  hint: string;
  price: number;
  animated?: boolean;
}

/** Rings drawn around the profile picture; their look lives in globals.css under `.frame-<name>`. */
const FRAMES: StoreItem[] = [
  { id: "frame:neon", kind: "frame", name: "نئون", hint: "حلقهٔ آبی و صورتی که دور عکس می‌چرخد", price: 150, animated: true },
  { id: "frame:gold", kind: "frame", name: "طلایی", hint: "قاب طلایی با برق آرام", price: 200, animated: true },
  { id: "frame:fire", kind: "frame", name: "آتش", hint: "شعله‌های نارنجی که می‌تپند", price: 220, animated: true },
  { id: "frame:aurora", kind: "frame", name: "شفق", hint: "سبز و بنفش شفق قطبی", price: 180, animated: true },
  { id: "frame:tazhib", kind: "frame", name: "تذهیب", hint: "نقش ستارهٔ هشت‌پر طلایی، به سبک کتاب‌آرایی ایرانی", price: 300, animated: true },
  { id: "frame:sakura", kind: "frame", name: "شکوفه", hint: "شکوفه‌های صورتی دور عکس", price: 160, animated: true },
  { id: "frame:rainbow", kind: "frame", name: "رنگین‌کمان", hint: "همهٔ رنگ‌ها، پشت سر هم", price: 120, animated: true },
  { id: "frame:emerald", kind: "frame", name: "زمرد", hint: "قاب سبز ساده و براق", price: 100 },
];

/** Pictures behind your name on the profile card; their look lives in globals.css under `.profile-bg-<name>`. */
const BACKGROUNDS: StoreItem[] = [
  { id: "background:starry", kind: "background", name: "شب پرستاره", hint: "آسمان شب کویر با ستاره‌های چشمک‌زن", price: 200, animated: true },
  { id: "background:aurora", kind: "background", name: "شفق قطبی", hint: "نوارهای رنگی که آرام موج می‌خورند", price: 250, animated: true },
  { id: "background:desert", kind: "background", name: "غروب کویر", hint: "تپه‌های شنی زیر آسمان نارنجی", price: 180 },
  { id: "background:tile", kind: "background", name: "کاشی فیروزه‌ای", hint: "نقش کاشی ایرانی که آهسته می‌لغزد", price: 300, animated: true },
  { id: "background:sea", kind: "background", name: "خلیج فارس", hint: "موج‌های آبی، پشت سر هم", price: 220, animated: true },
  { id: "background:synth", kind: "background", name: "شهر نئونی", hint: "جادهٔ نئونی رو به افق", price: 350, animated: true },
];

const STICKERS: StoreItem[] = STICKER_PACKS.flatMap((p) =>
  p.price ? [{ id: stickerItemId(p.id), kind: "stickers" as const, name: p.name, hint: `${toPersianDigits(p.stickers.length)} استیکر`, price: p.price }] : [],
);

export function stickerItemId(packId: string) {
  return `stickers:${packId}`;
}

export const STORE_ITEMS: StoreItem[] = [...FRAMES, ...BACKGROUNDS, ...STICKERS];

export const findItem = (id: string) => STORE_ITEMS.find((i) => i.id === id);

/** The class name for an equipped look ("frame:neon" → "frame-neon"), or undefined for an unknown one. */
export function frameClass(id: string | null | undefined) {
  return id && findItem(id)?.kind === "frame" ? `frame-${id.slice("frame:".length)}` : undefined;
}

export function backgroundClass(id: string | null | undefined) {
  return id && findItem(id)?.kind === "background" ? `profile-bg-${id.slice("background:".length)}` : undefined;
}

/** A sticker pack is free when it has no price; otherwise it has to be in the inventory. */
export function ownsStickerPack(packId: string, inventory: readonly string[] | undefined) {
  const pack = STICKER_PACKS.find((p) => p.id === packId);
  return !!pack && (!pack.price || !!inventory?.includes(stickerItemId(packId)));
}

const toman = new Intl.NumberFormat("fa-IR");

/** «۱٬۳۰۰» */
export const formatNumber = (n: number) => toman.format(n);

/** «۳۰٬۰۲۵ تومان» */
export const formatToman = (n: number) => `${toman.format(n)} تومان`;

/** «۱۵۰ پوینت» */
export const formatPoints = (n: number) => `${toman.format(n)} پوینت`;

/** «۶۲۱۹ ۸۶۱۹ ۰۳۵۷ ۵۴۷۹», for reading; copy the Latin digits instead. */
export const formatCard = (digits: string) => toPersianDigits(digits.replace(/(\d{4})(?=\d)/g, "$1 "));

export type TopUpStatus = "pending" | "submitted" | "approved" | "rejected" | "expired" | "cancelled";

export const TOPUP_STATUS: Record<TopUpStatus, { label: string; tone: "default" | "accent" | "danger" }> = {
  pending: { label: "منتظر واریز", tone: "default" },
  submitted: { label: "در انتظار تأیید", tone: "accent" },
  approved: { label: "تأیید شد", tone: "accent" },
  rejected: { label: "رد شد", tone: "danger" },
  expired: { label: "منقضی شد", tone: "default" },
  cancelled: { label: "لغو شد", tone: "default" },
};

/** An order left unpaid this long expires and frees its amount for someone else. */
export const TOPUP_TTL_MS = 24 * 60 * 60 * 1000;

/** Opens the store window from anywhere (the profile menu, a locked sticker pack); App listens for it. */
export const OPEN_STORE_EVENT = "sedaamon:open-store";
export function openStore(tab?: StoreItemKind | "wallet") {
  window.dispatchEvent(new CustomEvent(OPEN_STORE_EVENT, { detail: tab }));
}
