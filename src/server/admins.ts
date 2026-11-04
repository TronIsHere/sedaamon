import { normalizePhone } from "@/lib/phone";

/** Who may open /admin: the numbers in ADMIN_PHONES (comma separated), or the site owner's when it is unset. */
const ADMIN_PHONES = new Set(
  (process.env.ADMIN_PHONES ?? "09306613683")
    .split(",")
    .map((p) => normalizePhone(p))
    .filter((p): p is string => !!p),
);

export const isAdminPhone = (phone: string) => ADMIN_PHONES.has(phone);
