import { AudioLines, Plus } from "lucide-react";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { MeDTO, ServerDTO } from "@/lib/types";
import Avatar, { ServerAvatar } from "./Avatar";

export default function ServerRail({
  me,
  servers,
  activeId,
  unread,
  onSelect,
  onAdd,
  onProfile,
}: {
  me: MeDTO;
  servers: ServerDTO[];
  activeId?: string;
  /** serverId → unread messages */
  unread: Record<string, number>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onProfile: () => void;
}) {
  return (
    <nav className="flex w-[72px] flex-col items-center bg-ink-950 pt-4 pb-safe-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-strong text-white shadow-lg shadow-accent-strong/40">
        <AudioLines className="size-5" />
      </span>
      <button
        onClick={onProfile}
        title="حساب کاربری"
        aria-label="حساب کاربری"
        className="mt-4 shrink-0 rounded-full p-0.5 ring-2 ring-accent/60 transition hover:ring-accent"
      >
        <Avatar user={me} size="md" />
      </button>

      <p className="mt-6 mb-2 shrink-0 text-[10px] font-semibold tracking-wide text-muted">سرورها</p>
      <div className="scrollbar-none flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto py-1">
        {servers.map((s) => {
          const active = s.id === activeId;
          const count = active ? 0 : (unread[s.id] ?? 0);
          return (
            <div key={s.id} className="relative flex w-full shrink-0 justify-center">
              <span
                className={cn(
                  "absolute start-0 top-1/2 w-1 -translate-y-1/2 rounded-e-full bg-accent transition-all",
                  active ? "h-8" : count ? "h-2" : "h-0",
                )}
              />
              <button title={s.name} aria-label={s.name} onClick={() => onSelect(s.id)} className="group relative rounded-xl">
                {active ? (
                  <ServerAvatar name={s.name} className="size-11 rounded-xl text-base" />
                ) : (
                  <span className="grid size-11 place-items-center rounded-xl bg-ink-850 text-base font-semibold text-muted ring-1 ring-white/5 transition group-hover:bg-ink-700 group-hover:text-fg">
                    {s.name.trim()[0]}
                  </span>
                )}
                {count > 0 && <Badge count={count} className="absolute -end-1.5 -bottom-1 ring-2 ring-ink-950" />}
              </button>
            </div>
          );
        })}
      </div>

      <button
        title="ساختن یا پیوستن به سرور"
        aria-label="ساختن یا پیوستن به سرور"
        onClick={onAdd}
        className="mt-3 grid size-11 shrink-0 place-items-center rounded-xl bg-accent-strong text-white shadow-lg shadow-accent-strong/40 transition hover:bg-accent active:scale-95"
      >
        <Plus className="size-5" />
      </button>
    </nav>
  );
}

export function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full bg-accent-strong px-1.5 text-[11px] leading-none font-bold text-white",
        className,
      )}
    >
      {count > 99 ? "۹۹+" : toPersianDigits(count)}
    </span>
  );
}
