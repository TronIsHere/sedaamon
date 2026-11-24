import { normalizePhone } from "@/lib/phone";

/** Who may open /admin: the numbers in ADMIN_PHONES (comma separated). When it is unset, nobody can. */
const ADMIN_PHONES = new Set(
  (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((p) => normalizePhone(p))
    .filter((p): p is string => !!p),
);

export const isAdminPhone = (phone: string) => ADMIN_PHONES.has(phone);
