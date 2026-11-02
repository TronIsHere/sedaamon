import { cn } from "@/lib/format";
import type { UserDTO } from "@/lib/types";

export default function Avatar({
  user,
  size = "md",
  speaking = false,
}: {
  user: Pick<UserDTO, "name" | "color">;
  size?: "sm" | "md" | "lg";
  speaking?: boolean;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 transition",
        size === "sm" && "size-6 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-20 text-3xl",
        speaking ? "ring-accent" : "ring-white/10",
      )}
      style={{ background: `linear-gradient(135deg, ${user.color}, color-mix(in oklab, ${user.color} 55%, #6c5ce7))` }}
    >
      {user.name.trim()[0] ?? "?"}
    </span>
  );
}

/** A server's initial on a violet gradient tile, used in the rail, chat header and info panel. */
export function ServerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-linear-135 from-accent to-[#c46cf5] font-bold text-white shadow-lg shadow-accent-strong/20",
        className,
      )}
    >
      {name.trim()[0] ?? "?"}
    </span>
  );
}
