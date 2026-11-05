import { Compass, MessageCircle, Plus, Users } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { MeDTO, ServerDTO } from "@/lib/types";

export default function ServerRail({
  servers,
  activeId,
  unread,
  pings,
  onSelect,
  onAdd,
  friendRequests,
  dmActive,
  dmUnread,
  onDms,
  onFriends,
  onDiscover,
}: {
  me: MeDTO;
  servers: ServerDTO[];
  activeId?: string;
  /** serverId → unread messages */
  unread: Record<string, number>;
  /** serverId → unread pings (mentions and replies) */
  pings: Record<string, number>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  /** Friend requests waiting for an answer. */
  friendRequests: number;
  /** Direct messages are open instead of a server. */
  dmActive: boolean;
  dmUnread: number;
  onDms: () => void;
  onFriends: () => void;
  onDiscover: () => void;
  /** Opens your account; reached from the header avatar and the sidebar footer instead of the rail. */
  onProfile: () => void;
}) {
  return (
    <nav aria-label="سرورها" className="flex w-[76px] flex-col items-center bg-ink-900 pt-4 pb-safe-4 md:rounded-[1.75rem] md:pb-4">
      <BrandMark className="size-12 shrink-0" radius={256} />

      <div className="mt-5 flex shrink-0 flex-col items-center gap-2.5">
        <RailButton label="پیام‌های مستقیم" active={dmActive} onClick={onDms}>
          <MessageCircle className="size-5" />
          {dmUnread > 0 && !dmActive && <Badge count={dmUnread} className="absolute -end-1 -top-1 ring-2 ring-ink-900" />}
        </RailButton>
        <RailButton label="دوستان" onClick={onFriends}>
          <Users className="size-5" />
          {friendRequests > 0 && <Badge count={friendRequests} className="absolute -end-1 -top-1 ring-2 ring-ink-900" />}
        </RailButton>
        <RailButton label="کاوش سرورها" onClick={onDiscover}>
          <Compass className="size-5" />
        </RailButton>
      </div>

      <div role="separator" className="mx-auto my-4 h-px w-8 shrink-0 rounded-full bg-ink-700" />
      <div className="scrollbar-none flex w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto py-1">
        {servers.map((s) => {
          const active = s.id === activeId;
          const pinged = active ? 0 : (pings[s.id] ?? 0);
          const count = active ? 0 : (unread[s.id] ?? 0);
          return (
            <button
              key={s.id}
              title={s.name}
              aria-label={s.name}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(s.id)}
              className={cn(
                "relative grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors duration-150",
                active
                  ? "bg-ink-800 text-fg ring-2 ring-accent ring-offset-2 ring-offset-ink-900"
                  : "bg-ink-800 text-muted hover:bg-ink-700 hover:text-fg",
                count > 0 && !active && "text-fg",
              )}
            >
              {s.icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploads are already 256px and served by our own route
                <img src={s.icon} alt="" draggable={false} className="size-full rounded-full object-cover" />
              ) : (
                initials(s.name)
              )}
              {count > 0 && <Badge count={pinged || count} ping={pinged > 0} className="absolute -end-1 -bottom-0.5 ring-2 ring-ink-900" />}
            </button>
          );
        })}
      </div>

      <button
        title="ساختن یا پیوستن به سرور"
        aria-label="ساختن یا پیوستن به سرور"
        onClick={onAdd}
        className="mt-3 grid size-12 shrink-0 place-items-center rounded-full bg-accent-strong text-on-accent transition hover:brightness-105 active:scale-95"
      >
        <Plus className="size-6" />
      </button>
    </nav>
  );
}

/** Up to two initials, kept as separate letters (ZWNJ) so Persian ones don't join into a word. */
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("\u200c");
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative grid size-12 shrink-0 place-items-center rounded-full transition-colors duration-150",
        active ? "bg-accent-strong text-on-accent" : "bg-ink-800 text-muted hover:bg-ink-700 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** `ping` turns it red: someone named you or answered you, not just new messages. */
export function Badge({ count, ping, className }: { count: number; ping?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-none font-bold",
        ping ? "bg-danger-strong text-white" : "bg-accent-strong text-on-accent",
        className,
      )}
    >
      {count > 99 ? "۹۹+" : toPersianDigits(count)}
    </span>
  );
}
