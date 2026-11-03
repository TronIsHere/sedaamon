import { BADGE_ORDER, BADGES } from "@/lib/badges";
import { cn } from "@/lib/format";
import type { BadgeId } from "@/lib/types";

/** A badge emblem at `size` pixels, for use beside a name. */
export function BadgeIcon({ id, size = 18, className }: { id: BadgeId; size?: number; className?: string }) {
  const badge = BADGES[id];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size local art; next/image adds nothing here.
    <img
      src={badge.src}
      alt={badge.title}
      title={`${badge.title} — ${badge.description}`}
      width={size}
      height={size}
      draggable={false}
      className={cn("inline-block shrink-0 select-none", className)}
    />
  );
}

/** Every badge a member could hold: the ones they have in full colour, the rest greyed out. */
export function BadgeShelf({ earned }: { earned: readonly BadgeId[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {BADGE_ORDER.map((id) => {
        const badge = BADGES[id];
        const has = earned.includes(id);
        return (
          <li
            key={id}
            title={badge.description}
            className={cn("flex flex-col items-center rounded-2xl bg-ink-850 px-2 py-3 text-center ring-1 ring-line", !has && "opacity-60")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size local art; next/image adds nothing here. */}
            <img
              src={badge.src}
              alt=""
              width={56}
              height={56}
              draggable={false}
              className={cn("size-14 select-none", !has && "opacity-40 grayscale")}
            />
            <span className="mt-1.5 text-xs leading-4 font-semibold">{badge.title}</span>
            <span className={cn("mt-1 text-[11px] leading-4", has ? "text-online" : "text-muted")}>{has ? "دریافت شده" : "قفل"}</span>
          </li>
        );
      })}
    </ul>
  );
}
