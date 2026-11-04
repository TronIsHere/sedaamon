"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/format";
import { faDigits } from "@/lib/jalali";

export type Toast = {
  /** Toasts with the same id replace each other (or count up, with `group`). Generated when left out. */
  id?: string;
  /** Gets how many toasts this one stands for when grouped. */
  title: ReactNode | ((count: number) => ReactNode);
  description?: ReactNode;
  /** A smaller third line, e.g. where something happened. */
  meta?: ReactNode;
  variant?: "default" | "success" | "error";
  /** Replaces the status icon, e.g. with an avatar. */
  icon?: ReactNode;
  /** A small mark on the icon's corner; a count takes its place once the toast is grouped. */
  badge?: ReactNode;
  /** A later toast with the same id adds to this one ("3 messages from …") instead of replacing it. */
  group?: boolean;
  /** Extra names `dismiss` matches, e.g. each message a grouped toast covers. */
  refs?: string[];
  /** Makes the whole card a button; the toast closes after it runs. */
  onClick?: () => void;
  action?: { label: string; onClick: () => void };
  duration?: number;
};

type Item = Toast & { id: string; count: number };
type Ctx = { toast: (t: Toast) => string; dismiss: (idOrRef: string) => void; dismissAll: () => void };
const ToastCtx = createContext<Ctx | null>(null);

/** How far each card behind the front one peeks out, and the gap between cards once spread out. */
const PEEK = 9;
const GAP = 8;
/** Cards still drawn behind the front one while collapsed. */
const BEHIND = 2;

/**
 * Toasts under the app header, from the VibeFarsi toast: newer ones collapse into a stack that spreads out on hover,
 * focus or a tap on "n more". Wrap the app once, then call `useToast().toast({...})`. Timers pause while it is spread out.
 */
export function ToastProvider({ children, max = 5 }: { children: ReactNode; max?: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [hovered, setHovered] = useState(false);
  const [opened, setOpened] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  const timers = useRef(new Map<string, number>());
  /** id → when it closes, while timers run. */
  const due = useRef(new Map<string, number>());
  /** id → ms it had left, while paused. */
  const left = useRef(new Map<string, number>());
  const paused = useRef(false);
  const expanded = (hovered || opened) && items.length > 0;

  const commit = useCallback((next: Item[]) => {
    itemsRef.current = next;
    setItems(next);
    setHeights((m) => Object.fromEntries(next.flatMap((t) => (t.id in m ? [[t.id, m[t.id]]] : []))));
    if (next.length < 2) setOpened(false);
  }, []);

  const forget = useCallback((id: string) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    due.current.delete(id);
    left.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (key: string) => {
      const gone = itemsRef.current.filter((t) => t.id === key || t.refs?.includes(key));
      if (!gone.length) return;
      gone.forEach((t) => forget(t.id));
      commit(itemsRef.current.filter((t) => !gone.includes(t)));
    },
    [commit, forget],
  );

  const dismissAll = useCallback(() => {
    itemsRef.current.forEach((t) => forget(t.id));
    commit([]);
  }, [commit, forget]);

  const start = useCallback(
    (id: string, ms: number) => {
      window.clearTimeout(timers.current.get(id));
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
      due.current.set(id, Date.now() + ms);
    },
    [dismiss],
  );

  const toast = useCallback(
    (t: Toast) => {
      const id = t.id ?? `${Date.now()}-${Math.random()}`;
      const prev = t.group ? itemsRef.current.find((x) => x.id === id) : undefined;
      const item: Item = {
        ...t,
        id,
        count: (prev?.count ?? 0) + 1,
        refs: prev ? [...new Set([...(prev.refs ?? []), ...(t.refs ?? [])])] : t.refs,
      };
      const next = [item, ...itemsRef.current.filter((x) => x.id !== id)];
      next.slice(max).forEach((x) => forget(x.id));
      commit(next.slice(0, max));
      const ms = t.duration ?? 5000;
      if (paused.current) left.current.set(id, ms);
      else start(id, ms);
      return id;
    },
    [commit, forget, start, max],
  );

  // Spread out means someone is reading: hold every timer, then give each back what it had left (a little at least).
  useEffect(() => {
    if (expanded && !paused.current) {
      paused.current = true;
      for (const [id, timer] of timers.current) {
        window.clearTimeout(timer);
        left.current.set(id, Math.max(0, (due.current.get(id) ?? 0) - Date.now()));
      }
      timers.current.clear();
    } else if (!expanded && paused.current) {
      paused.current = false;
      for (const [id, ms] of left.current) start(id, Math.max(ms, 1500));
      left.current.clear();
    }
  }, [expanded, start]);

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((t) => window.clearTimeout(t));
  }, []);

  const measure = useCallback((id: string, h: number) => setHeights((m) => (m[id] === h ? m : { ...m, [id]: h })), []);
  const value = useMemo(() => ({ toast, dismiss, dismissAll }), [toast, dismiss, dismissAll]);

  const frontHeight = items[0] ? (heights[items[0].id] ?? 64) : 0;
  // Spread out, each card sits below the ones before it.
  const tops = items.reduce<number[]>((acc, t, i) => [...acc, i ? acc[i - 1] + (heights[items[i - 1].id] ?? 64) + GAP : 0], []);
  const placed = items.map((t, i) => ({ t, i, y: tops[i] }));
  const fullHeight = items.length ? tops[items.length - 1] + (heights[items[items.length - 1].id] ?? 64) : 0;
  const stackHeight = expanded ? fullHeight : frontHeight + Math.min(items.length - 1, BEHIND) * PEEK;
  const more = items.length - 1;

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <section
        aria-label="اعلان‌ها"
        aria-live="polite"
        className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+4.5rem)] left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2"
      >
        <div
          className="pointer-events-auto relative transition-[height] duration-300 ease-out-soft"
          style={{ height: stackHeight }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHovered(false)}
        >
          {placed.map(({ t, i, y }) => {
            const behind = !expanded && i > 0;
            return (
              <div
                key={t.id}
                inert={behind}
                className={cn(
                  "surface-float absolute inset-x-0 top-0 origin-bottom overflow-hidden rounded-2xl transition-[transform,opacity,height] duration-300 ease-out-soft",
                  i === 0 && "animate-drop-in",
                )}
                style={{
                  zIndex: items.length - i,
                  height: behind ? frontHeight : (heights[t.id] ?? "auto"),
                  transform: expanded ? `translateY(${y}px)` : `translateY(${i * PEEK}px) scale(${1 - i * 0.05})`,
                  opacity: behind && i > BEHIND ? 0 : 1,
                  // A shade lighter than the front card, or the edge peeking out vanishes under its shadow.
                  ...(behind && { background: "color-mix(in oklab, var(--color-ink-700) 96%, transparent)" }),
                  // Only the backmost card casts the big shadow while collapsed; the ones in front would darken its edge away.
                  ...(!expanded && i < Math.min(items.length - 1, BEHIND) && { boxShadow: "0 0 0 1px rgb(255 255 255 / 0.08)" }),
                }}
              >
                <ToastBody toast={t} hidden={behind} onClose={() => dismiss(t.id)} onHeight={(h) => measure(t.id, h)} />
              </div>
            );
          })}
        </div>
        {more > 0 && (
          <div className="pointer-events-auto mt-2 flex justify-center gap-1 text-xs text-muted">
            {/* Touch screens have no hover, so they get a button to spread the stack out. */}
            <button
              type="button"
              onClick={() => setOpened((o) => !o)}
              className="rounded-full px-2.5 py-1 transition-colors hover:text-fg [@media(hover:hover)]:hidden"
            >
              {expanded ? "جمع کردن" : `${faDigits(more)} اعلان دیگر`}
            </button>
            <button type="button" onClick={dismissAll} className="rounded-full px-2.5 py-1 transition-colors hover:text-fg">
              بستن همه ({faDigits(items.length)})
            </button>
          </div>
        )}
      </section>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast باید داخل <ToastProvider> استفاده شود.");
  return ctx;
}

const icons = { default: Info, success: Check, error: AlertCircle };

/** What's inside one card. Reports its natural height so the stack can lay cards out without clipping them. */
function ToastBody({ toast, hidden, onClose, onHeight }: { toast: Item; hidden: boolean; onClose: () => void; onHeight: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const report = () => onHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onHeight is a fresh closure each render; the element is what matters
  }, []);

  const Icon = icons[toast.variant ?? "default"];
  const mark = toast.count > 1 ? faDigits(toast.count) : toast.badge;
  const body = (
    <>
      {toast.icon ? (
        <span className="relative shrink-0">
          {toast.icon}
          {mark && (
            <span className="absolute -end-1 -bottom-1 grid size-4.5 place-items-center rounded-full bg-accent-strong text-[10px] font-semibold text-on-accent ring-2 ring-ink-800">
              {mark}
            </span>
          )}
        </span>
      ) : (
        <span
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
            toast.variant === "error" ? "bg-danger text-white" : toast.variant === "success" ? "bg-accent text-on-accent" : "bg-fg text-ink-950",
          )}
        >
          <Icon className="size-3" />
        </span>
      )}
      <span className="min-w-0 flex-1 text-sm leading-5">
        <span className="block">{typeof toast.title === "function" ? toast.title(toast.count) : toast.title}</span>
        {toast.description && (
          <span dir="auto" className="block truncate text-xs text-muted">
            {toast.description}
          </span>
        )}
        {toast.meta && <span className="block truncate text-xs text-muted/80">{toast.meta}</span>}
      </span>
    </>
  );

  return (
    <div
      ref={ref}
      role="status"
      aria-hidden={hidden || undefined}
      className={cn("flex gap-3 px-3.5 py-3 transition-opacity duration-200", toast.icon ? "items-center" : "items-start", hidden && "opacity-0")}
    >
      {toast.onClick ? (
        <button
          type="button"
          onClick={() => {
            toast.onClick?.();
            onClose();
          }}
          className={cn("flex min-w-0 flex-1 gap-3 text-start", toast.icon ? "items-center" : "items-start")}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onClose();
          }}
          className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs transition-colors hover:bg-ink-700"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="بستن" onClick={onClose} className="-me-1 shrink-0 rounded p-1 text-muted transition-colors hover:text-fg">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
