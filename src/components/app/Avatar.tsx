import { cn } from "@/lib/format";
import { STATUSES } from "@/lib/status";
import type { UserDTO } from "@/lib/types";

export default function Avatar({
  user,
  size = "md",
  speaking = false,
  online,
}: {
  user: Pick<UserDTO, "name" | "color" | "avatar" | "status">;
  size?: "sm" | "md" | "lg";
  speaking?: boolean;
  /** When set, a presence dot is drawn on the avatar: grey for offline, otherwise coloured by the person's status. */
  online?: boolean;
}) {
  const circle = (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white ring-2 transition-shadow duration-200",
        size === "sm" && "size-6 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-20 text-3xl",
        speaking ? "ring-accent shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_22%,transparent)]" : "ring-transparent",
      )}
      style={{ background: `color-mix(in oklab, ${user.color} 85%, black)` }}
    >
      {user.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- user uploads are already 256px and served by our own route
        <img src={user.avatar} alt="" draggable={false} className="size-full rounded-full object-cover" />
      ) : (
        (user.name.trim()[0] ?? "?")
      )}
    </span>
  );
  if (online === undefined) return circle;

  return (
    <span className="relative inline-flex shrink-0">
      {circle}
      <span
        role="img"
        aria-label={online ? "آنلاین" : "آفلاین"}
        className={cn(
          "absolute rounded-full ring-2 ring-ink-900",
          size === "sm" && "-end-0.5 -bottom-0.5 size-2",
          size === "md" && "-end-0.5 -bottom-0.5 size-3",
          size === "lg" && "end-0.5 bottom-0.5 size-5 ring-4",
          online ? (STATUSES.find((s) => s.value === (user.status ?? "available"))?.dot ?? "bg-online") : "bg-ink-600",
        )}
      />
    </span>
  );
}

/** A server's picture, or its initial on a lime tile when it has none. */
export function ServerAvatar({ name, icon, className }: { name: string; icon?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-accent-strong font-bold text-on-accent",
        className,
      )}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploads are already 256px and served by our own route
        <img src={icon} alt="" draggable={false} className="size-full object-cover" />
      ) : (
        (name.trim()[0] ?? "?")
      )}
    </span>
  );
}
