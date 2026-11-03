/** Directory categories. The id is what the server stores; the label is what people read. */
export const CATEGORIES = [
  { id: "chat", label: "گپ و دوستی" },
  { id: "gaming", label: "بازی" },
  { id: "music", label: "موسیقی" },
  { id: "movies", label: "فیلم و سریال" },
  { id: "tech", label: "فناوری" },
  { id: "education", label: "آموزش" },
  { id: "art", label: "هنر و طراحی" },
  { id: "sports", label: "ورزش" },
  { id: "business", label: "کسب‌وکار" },
  { id: "other", label: "سایر" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "سایر";

export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 20;
export const MIN_DESCRIPTION = 10;
export const MAX_DESCRIPTION = 300;

/** Tags as people type them: trimmed, a leading "#" dropped, spaces collapsed, no empties or repeats. */
export function cleanTags(tags: readonly string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, MAX_TAGS);
}
