"use client";

import { useEffect, useState } from "react";
import { Compass, Loader2, Search, SearchX, Users } from "lucide-react";
import { api } from "@/lib/api";
import { CATEGORIES, categoryLabel } from "@/lib/discovery";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { DiscoverDTO, DiscoverServerDTO, ServerDTO } from "@/lib/types";
import { ServerAvatar } from "./Avatar";
import { Modal } from "./Dialogs";

type Sort = "members" | "new";

/** The public server directory: search, filter by category or tag, and join without an invite link. */
export default function DiscoverDialog({
  onClose,
  onJoined,
  onOpen,
}: {
  onClose: () => void;
  /** A server was just joined from here. */
  onJoined: (server: ServerDTO) => void;
  /** Open a server the person is already in. */
  onOpen: (serverId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("members");
  const [result, setResult] = useState<DiscoverDTO | null>(null);
  const [servers, setServers] = useState<DiscoverServerDTO[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // A new search starts again from the first page.
  const [filterKey, setFilterKey] = useState("");
  const key = `${debounced}|${category}|${sort}`;
  if (key !== filterKey) {
    setFilterKey(key);
    setPage(0);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ q: debounced, category, sort, page: String(page) });
    api<DiscoverDTO>(`/api/discover?${params}`)
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setServers((prev) => (page === 0 ? res.servers : [...prev, ...res.servers.filter((s) => !prev.some((p) => p.id === s.id))]));
        setError(undefined);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, category, sort, page]);

  const join = async (s: DiscoverServerDTO) => {
    setJoining(s.id);
    setError(undefined);
    try {
      const res = await api<{ server: ServerDTO }>(`/api/discover/${s.id}/join`, { method: "POST", body: {} });
      onJoined(res.server);
    } catch (err) {
      setError((err as Error).message);
      setJoining(null);
    }
  };

  const total = result ? Object.values(result.categories).reduce((n, c) => n + c, 0) : 0;
  const hasMore = !!result && servers.length < result.total;

  return (
    <Modal title="کاوش سرورها" onClose={onClose} wide>
      <label className="flex items-center gap-2 rounded-xl bg-ink-850 px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent/60">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی نام، موضوع یا #برچسب"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted md:text-sm"
        />
      </label>

      <div className="scrollbar-none -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="دسته‌بندی">
        <Chip active={category === ""} onClick={() => setCategory("")}>
          همه{result && ` (${toPersianDigits(total)})`}
        </Chip>
        {CATEGORIES.filter((c) => result?.categories[c.id] || category === c.id).map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label} ({toPersianDigits(result?.categories[c.id] ?? 0)})
          </Chip>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{result ? `${toPersianDigits(result.total)} سرور` : " "}</span>
        <div className="flex gap-1 rounded-full bg-ink-850 p-0.5">
          {(
            [
              ["members", "پرطرفدار"],
              ["new", "تازه"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setSort(id)} aria-pressed={sort === id} className={cn("rounded-full px-3 py-1", sort === id ? "bg-ink-700 text-fg" : "hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <ul className="mt-3 space-y-2">
        {servers.map((s) => (
          <li key={s.id} className="flex gap-3 rounded-2xl bg-ink-850 p-3 ring-1 ring-line">
            <ServerAvatar name={s.name} icon={s.icon} className="size-14 rounded-2xl text-xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 leading-6">
                  <h3 className="truncate font-bold">{s.name}</h3>
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <span className="rounded-full bg-accent-strong/15 px-2 py-0.5 text-accent">{categoryLabel(s.category)}</span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {toPersianDigits(s.memberCount)} عضو
                    </span>
                  </p>
                </div>
                {s.joined ? (
                  <button onClick={() => onOpen(s.id)} className="shrink-0 rounded-xl bg-ink-800 px-3.5 py-1.5 text-sm text-muted hover:text-fg">
                    باز کردن
                  </button>
                ) : (
                  <button onClick={() => join(s)} disabled={joining !== null} className="btn-primary min-h-9 shrink-0 px-4 py-1.5 text-sm">
                    {joining === s.id && <Loader2 className="size-4 animate-spin" />}
                    پیوستن
                  </button>
                )}
              </div>
              <p dir="auto" className="mt-1.5 line-clamp-3 text-sm leading-6 break-words text-fg/80">
                {s.description}
              </p>
              {s.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <button key={t} onClick={() => setQuery(`#${t}`)} className="rounded-full bg-ink-850 px-2.5 py-0.5 text-xs text-muted ring-1 ring-line hover:text-fg">
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {loading && (
        <div className="grid place-items-center py-8 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {!loading && result && !servers.length && (
        <div className="py-12 text-center text-muted">
          {query || category ? <SearchX className="mx-auto size-8" /> : <Compass className="mx-auto size-8" />}
          <p className="mt-3 text-sm">{query || category ? "سروری با این جست‌وجو پیدا نشد" : "هنوز سروری در فهرست عمومی نیست. مالک سرور می‌تواند از تنظیمات سرور آن را اینجا قرار دهد."}</p>
        </div>
      )}
      {!loading && hasMore && (
        <button onClick={() => setPage((p) => p + 1)} className="mx-auto mt-4 block rounded-full bg-ink-850 px-5 py-2 text-sm text-accent ring-1 ring-line hover:bg-ink-800">
          نمایش بیشتر
        </button>
      )}
    </Modal>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors",
        active ? "bg-accent-strong text-on-accent ring-accent/40" : "bg-ink-850 text-muted ring-line hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
