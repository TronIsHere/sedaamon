const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDay = (iso: string) => day.format(new Date(iso));
export const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

const relative = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });
const longDay = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long", year: "numeric" });

export const formatDate = (iso: string) => longDay.format(new Date(iso));

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

const dateTime = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
