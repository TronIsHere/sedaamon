import { CATEGORIES } from "@/lib/discovery";

/** What a newcomer says they came for. The id is stored on the user; the rest is what the card shows. */
export const USE_CASES = [
  { id: "friends", title: "گپ با دوستان", lead: "شب‌نشینی صوتی، فیلم دیدن با هم و گروه‌های خودمانی." },
  { id: "gaming", title: "هماهنگی وسط بازی", lead: "صدای شفاف با تأخیر کم، کنار هم‌تیمی‌هایتان." },
  { id: "study", title: "کلاس و درس خواندن", lead: "کلاس آنلاین، رفع اشکال و مطالعه‌ی گروهی." },
  { id: "community", title: "ساختن یک جامعه", lead: "کانال، نقش، قوانین و رویداد برای اعضایتان." },
] as const;

export type UseCaseId = (typeof USE_CASES)[number]["id"];
export const USE_CASE_IDS = USE_CASES.map((u) => u.id) as [UseCaseId, ...UseCaseId[]];

/** Interests are the directory's categories, so they can point straight at public servers. "Other" says nothing. */
export const INTERESTS = CATEGORIES.filter((c) => c.id !== "other");
export const INTEREST_IDS = INTERESTS.map((c) => c.id) as string[];
