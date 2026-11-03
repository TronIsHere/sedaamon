import { formatJalali, JALALI_WEEKDAYS, jalaliWeekday, toJalali } from "./jalali";

// Dates are built from our own Jalali conversion rather than trusting the browser's default calendar for "fa-IR".
const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const DAY_MS = 86_400_000;

/** Whole calendar days from `date` to today: 0 today, 1 yesterday, … */
function daysAgo(date: Date) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(new Date()) - start(date)) / DAY_MS);
}

const thisJalaliYear = (date: Date) => toJalali(date).jy === toJalali(new Date()).jy;

export const formatTime = (iso: string) => time.format(new Date(iso));
export const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/** Date separator in a chat: «امروز», «دیروز», «دوشنبه، ۱۲ آبان», or with the year once it isn't this one. */
export function formatDay(iso: string) {
  const date = new Date(iso);
  const ago = daysAgo(date);
  if (ago === 0) return "امروز";
  if (ago === 1) return "دیروز";
  return formatJalali(date, { weekday: true, year: !thisJalaliYear(date) });
}

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

const relative = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });

/** «۱۲ آبان ۱۴۰۵» */
export const formatDate = (iso: string) => formatJalali(new Date(iso));

/** "۵ دقیقه پیش", "دیروز", … for a past moment. */
export function formatAgo(iso: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "چند لحظه پیش";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), "day");
  return formatDate(iso);
}

/** What follows «آخرین بازدید»: «۵ دقیقه پیش», «امروز ساعت ۱۴:۳۰», «دیروز ساعت …», «دوشنبه ساعت …», or a date. */
export function formatLastSeen(iso: string) {
  const date = new Date(iso);
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 3600) return formatAgo(iso);
  const ago = daysAgo(date);
  const at = `ساعت ${formatTime(iso)}`;
  if (ago === 0) return `امروز ${at}`;
  if (ago === 1) return `دیروز ${at}`;
  if (ago < 7) return `${JALALI_WEEKDAYS[jalaliWeekday(date)]} ${at}`;
  return formatJalali(date, { year: !thisJalaliYear(date) });
}

/** «۱۲ آبان، ساعت ۱۴:۳۰», with the year when it isn't this one. */
export function formatDateTime(iso: string) {
  const date = new Date(iso);
  return `${formatJalali(date, { year: !thisJalaliYear(date) })}، ساعت ${formatTime(iso)}`;
}
