import { HttpError } from "./errors";

export const MAX_CATEGORIES = 50;

export function cleanCategoryName(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 1 || clean.length > 32) throw new HttpError(400, "نام دسته باید بین ۱ تا ۳۲ حرف باشد");
  return clean;
}
