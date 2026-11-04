"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import { useCloseOnBack } from "@/lib/mobile";

/** Spread onto the element that opens the popover. */
export interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  "aria-controls": string;
}

const GAP = 8;
const MARGIN = 8;

/**
 * A small panel anchored to its trigger; closes on an outside press, Escape and the phone's back gesture.
 * Rendered into `document.body` with fixed positioning so overflow-hidden parents and the mobile drawer cannot
 * clip it. `align="start"` hugs the trigger's inline start (right in RTL); it flips sides when there is no room
 * and is kept inside the viewport. From the VibeFarsi popover, restyled for this app.
 */
export function Popover({
  trigger,
  children,
  label,
  side = "bottom",
  align = "start",
  open,
  onOpenChange,
  className,
}: {
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode;
  label: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [internal, setInternal] = useState(false);
  const isOpen = open ?? internal;
  const setOpen = (v: boolean) => {
    if (open === undefined) setInternal(v);
    onOpenChange?.(v);
  };
  const close = () => setOpen(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useCloseOnBack(isOpen, close);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = panel.current;
      if (!a || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const rtl = getComputedStyle(anchor.current!).direction === "rtl";
      const startEdge = rtl ? a.right - w : a.left;
      const endEdge = rtl ? a.left : a.right - w;
      const x = align === "center" ? a.left + a.width / 2 - w / 2 : align === "start" ? startEdge : endEdge;
      const above = a.top - GAP - h;
      const below = a.bottom + GAP;
      const fitsAbove = above >= MARGIN;
      const fitsBelow = below + h <= window.innerHeight - MARGIN;
      const y = side === "top" ? (fitsAbove || !fitsBelow ? above : below) : fitsBelow || !fitsAbove ? below : above;
      // Written straight to the element: it is measured and moved in the same frame, before paint.
      p.style.left = `${Math.min(Math.max(x, MARGIN), window.innerWidth - w - MARGIN)}px`;
      p.style.top = `${Math.min(Math.max(y, MARGIN), window.innerHeight - h - MARGIN)}px`;
    };
    place();
    // The panel's height changes as the textarea grows or a save error appears.
    const resize = new ResizeObserver(place);
    if (panel.current) resize.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen, side, align]);

  useEffect(() => {
    if (!isOpen) return;
    panel.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      anchor.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      {trigger({ ref: anchor, onClick: () => setOpen(!isOpen), "aria-haspopup": "dialog", "aria-expanded": isOpen, "aria-controls": id })}
      {isOpen &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            style={{ left: 0, top: 0 }}
            // React events bubble through portals: keep swipes in here from closing the drawer behind.
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className={cn(
              // ink-900 like dialogs, so the ink-800 text fields inside still stand out.
              "animate-pop-in fixed z-50 border border-line bg-ink-900 shadow-[var(--shadow-float)] w-[min(20rem,calc(100vw-1rem))] rounded-3xl p-4 text-sm outline-none",
              className,
            )}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
