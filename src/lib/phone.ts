const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toLatinDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (d) => String(Math.max(PERSIAN_DIGITS.indexOf(d), ARABIC_DIGITS.indexOf(d))));
}

/** Normalizes +98 / 0098 / 9xx / 09xx input to 09XXXXXXXXX, or null if it isn't an Iranian mobile number. */
export function normalizePhone(input: string) {
  let digits = toLatinDigits(input).replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (digits.startsWith("98")) digits = digits.slice(2);
  if (digits.startsWith("9")) digits = `0${digits}`;
  return /^09\d{9}$/.test(digits) ? digits : null;
}

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Any spelling of an Iranian mobile number (۰۹۱۲…, +98912…, 0098912…) as the 10 national digits «912…». */
export function nationalDigits(input: string) {
  let digits = toLatinDigits(input).replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (digits.startsWith("98") && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** «912 345 6789» */
export function formatNational(digits: string) {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(" ");
}

const OPERATORS: [RegExp, string][] = [
  [/^(91\d|99[0-6])/, "همراه اول"],
  [/^(93\d|90[1-5])/, "ایرانسل"],
  [/^92[0-2]/, "رایتل"],
  [/^998/, "شاتل موبایل"],
  [/^999/, "سامانتل"],
];

/** The operator a number belongs to, from its first three digits. */
export function mobileOperator(digits: string) {
  return digits.length < 3 ? null : (OPERATORS.find(([re]) => re.test(digits))?.[1] ?? null);
}
