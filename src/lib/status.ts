import type { Status } from "./types";

export const STATUSES: { value: Status; label: string; dot: string }[] = [
  { value: "available", label: "در دسترس", dot: "bg-online" },
  { value: "busy", label: "مشغول", dot: "bg-danger" },
  { value: "away", label: "نیستم", dot: "bg-amber-400" },
  { value: "gaming", label: "در حال بازی", dot: "bg-accent" },
];

export const statusLabel = (status: Status | undefined) => STATUSES.find((s) => s.value === (status ?? "available"))?.label ?? "";

/** The line shown under a name: the custom text if there is one, otherwise the status when it is not the default. */
export const statusLine = (u: { status?: Status; statusText?: string }) => u.statusText || (u.status && u.status !== "available" ? statusLabel(u.status) : "");
