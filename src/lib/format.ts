const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDay = (iso: string) => day.format(new Date(iso));
export const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");
