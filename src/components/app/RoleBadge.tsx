import { Crown, Shield } from "lucide-react";
import { cn } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Role } from "@/lib/types";

/** A small icon next to a name for owners and admins. Plain members get nothing. */
export function RoleIcon({ role, className }: { role: Role; className?: string }) {
  if (role === "member") return null;
  const Icon = role === "owner" ? Crown : Shield;
  return (
    <Icon
      aria-label={ROLE_LABEL[role]}
      className={cn("size-3.5 shrink-0", role === "owner" ? "text-amber-400" : "text-sky-400", className)}
    />
  );
}

export function RolePill({ role }: { role: Role }) {
  if (role === "member") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        role === "owner" ? "bg-amber-400/15 text-amber-300" : "bg-sky-400/15 text-sky-300",
      )}
    >
      <RoleIcon role={role} className="size-3 text-current" />
      {ROLE_LABEL[role]}
    </span>
  );
}
