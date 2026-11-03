import { CalendarCheck, Crown, Gavel, Hash, Shield, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Role } from "@/lib/types";

/** Icon, icon colour, and pill colours of every role that stands out from plain members. */
const LOOK: Record<Exclude<Role, "member">, { Icon: LucideIcon; icon: string; pill: string }> = {
  owner: { Icon: Crown, icon: "text-amber-400", pill: "bg-amber-400/15 text-amber-300" },
  admin: { Icon: Shield, icon: "text-sky-400", pill: "bg-sky-400/15 text-sky-300" },
  moderator: { Icon: Gavel, icon: "text-violet-400", pill: "bg-violet-400/15 text-violet-300" },
  organizer: { Icon: CalendarCheck, icon: "text-emerald-400", pill: "bg-emerald-400/15 text-emerald-300" },
  channel_manager: { Icon: Hash, icon: "text-rose-400", pill: "bg-rose-400/15 text-rose-300" },
};

/** A small icon next to a name for everyone with a role. Plain members get nothing. */
export function RoleIcon({ role, className }: { role: Role; className?: string }) {
  if (role === "member") return null;
  const { Icon, icon } = LOOK[role];
  return <Icon aria-label={ROLE_LABEL[role]} className={cn("size-3.5 shrink-0", icon, className)} />;
}

export function RolePill({ role }: { role: Role }) {
  if (role === "member") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", LOOK[role].pill)}>
      <RoleIcon role={role} className="size-3 text-current" />
      {ROLE_LABEL[role]}
    </span>
  );
}
