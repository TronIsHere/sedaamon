import { Crown, Shield } from "lucide-react";
import { cn } from "@/lib/format";
import { OWNER_LABEL, topRole } from "@/lib/permissions";
import type { MemberDTO, RoleDTO } from "@/lib/types";

const OWNER_COLOR = "#fbbf24";

/** A small icon next to a name: a crown for the owner, a shield in the colour of their highest role for everyone with one. Plain members get nothing. */
export function RoleIcon({ member, roles, className }: { member: Pick<MemberDTO, "owner" | "roles">; roles: readonly RoleDTO[]; className?: string }) {
  if (member.owner) return <Crown aria-label={OWNER_LABEL} style={{ color: OWNER_COLOR }} className={cn("size-3.5 shrink-0", className)} />;
  const top = topRole(member, roles);
  if (!top) return null;
  return <Shield aria-label={top.name} style={{ color: top.color }} className={cn("size-3.5 shrink-0", className)} />;
}

/** One coloured pill per role, or the owner's crown. */
export function RolePills({ member, roles }: { member: Pick<MemberDTO, "owner" | "roles">; roles: readonly RoleDTO[] }) {
  const held = roles.filter((r) => member.roles.includes(r.id));
  if (!member.owner && !held.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {member.owner && <Pill color={OWNER_COLOR} label={OWNER_LABEL} owner />}
      {held.map((r) => (
        <Pill key={r.id} color={r.color} label={r.name} />
      ))}
    </span>
  );
}

function Pill({ color, label, owner }: { color: string; label: string; owner?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color, backgroundColor: `${color}26` }}>
      {owner ? <Crown className="size-3" /> : <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </span>
  );
}
