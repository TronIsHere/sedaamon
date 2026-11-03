const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Folds text for matching: Persian and Arabic digits become 0-9, Arabic ي/ى/ك become Persian ی/ک, and letters are
 * lowercased, so «۱۲۳» finds "123" and «علي» finds «علی». Every character maps to exactly one, so an index into the
 * folded text is also an index into the original — which is how matches get highlighted.
 */
export function foldForSearch(text: string) {
  return text.replace(/[^]/g, (c) => {
    if (c === "ي" || c === "ى") return "ی";
    if (c === "ك") return "ک";
    const digit = Math.max(PERSIAN_DIGITS.indexOf(c), ARABIC_DIGITS.indexOf(c));
    if (digit !== -1) return String(digit);
    // A few letters ("İ") lowercase to two characters; leave those as they are to keep the lengths equal.
    const lower = c.toLowerCase();
    return lower.length === 1 ? lower : c;
  });
}

/** Whether `text` contains `query`, where `query` was already folded with {@link foldForSearch}. */
export const matchesSearch = (text: string, query: string) => !query || foldForSearch(text).includes(query);
