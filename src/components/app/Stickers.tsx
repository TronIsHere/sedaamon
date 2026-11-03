"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { useCloseOnBack } from "@/lib/mobile";
import { findSticker, STICKER_PACKS, type Sticker, type StickerStyle } from "@/lib/stickers";

/** Points of an eight-pointed star (two overlapping squares), as in a Persian tile or illuminated medallion. */
function starPoints(outer: number) {
  const inner = (outer * Math.SQRT1_2) / Math.cos(Math.PI / 8);
  return Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

const OUTER_STAR = starPoints(47);
const INNER_STAR = starPoints(39);

/** One sticker drawn at `size` pixels square. Everything inside scales with it. */
export function StickerArt({ id, size }: { id: string; size: number }) {
  const found = findSticker(id);
  if (!found) {
    return (
      <span className="grid place-items-center rounded-2xl bg-ink-850 text-xs text-muted" style={{ width: size, height: size }}>
        استیکر
      </span>
    );
  }
  const { sticker, pack } = found;
  return (
    <span
      role="img"
      aria-label={sticker.text}
      className="relative inline-block shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size / 8 }}
    >
      {sticker.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local, fixed-size art; next/image adds nothing here.
        <img src={sticker.src} alt="" draggable={false} className="size-full object-contain" />
      ) : (
        <Drawn sticker={sticker} style={pack.style} />
      )}
    </span>
  );
}

function Drawn({ sticker, style }: { sticker: Sticker; style: StickerStyle }) {
  if (style === "ornament") {
    return (
      <>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full drop-shadow-[0_0.15em_0.3em_rgb(0_0_0/0.45)]" aria-hidden>
          <polygon points={OUTER_STAR} fill={sticker.bg} stroke={sticker.fg} strokeWidth="1.6" strokeLinejoin="round" />
          <polygon points={INNER_STAR} fill="none" stroke={sticker.fg} strokeWidth="0.6" strokeDasharray="1.2 1.8" opacity="0.7" />
          <circle cx="50" cy="50" r="27" fill="none" stroke={sticker.fg} strokeWidth="0.5" opacity="0.45" />
        </svg>
        <span
          className="absolute inset-[20%] grid place-items-center text-center leading-[1.35] font-black text-balance"
          style={{ color: sticker.fg, fontSize: sticker.text.length > 8 ? "0.95em" : "1.2em" }}
        >
          {sticker.text}
        </span>
      </>
    );
  }
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-[0.15em]">
      <span className="text-[3.2em] leading-none drop-shadow-[0_0.08em_0.12em_rgb(0_0_0/0.4)]">{sticker.emoji}</span>
      <span
        className="max-w-full -rotate-3 rounded-[0.5em] px-[0.5em] py-[0.1em] text-center leading-[1.5] font-black whitespace-nowrap shadow-[0_0.1em_0.25em_rgb(0_0_0/0.4)] ring-[0.12em] ring-white"
        style={{ background: sticker.bg, color: sticker.fg, fontSize: sticker.text.length > 9 ? "0.85em" : "1em" }}
      >
        {sticker.text}
      </span>
    </span>
  );
}

/** The sticker tray above the composer. Picking one sends it right away. */
export function StickerPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [packId, setPackId] = useState(STICKER_PACKS[0].id);
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnBack(true, onClose);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // The toggle button sits outside the tray and closes it itself.
      const target = e.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest("[data-sticker-toggle]")) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const pack = STICKER_PACKS.find((p) => p.id === packId) ?? STICKER_PACKS[0];
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="استیکرها"
      className="absolute inset-x-0 bottom-full z-20 mb-2 surface-float animate-pop-in overflow-hidden rounded-2xl sm:start-auto sm:w-96"
    >
      <div role="tablist" className="flex gap-1 border-b border-line p-1.5">
        {STICKER_PACKS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === pack.id}
            onClick={() => setPackId(p.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              p.id === pack.id ? "bg-ink-700 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="scrollbar-thin grid max-h-72 grid-cols-4 gap-1 overflow-y-auto p-2">
        {pack.stickers.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            title={s.text}
            className="grid aspect-square place-items-center rounded-xl transition hover:bg-ink-700 active:scale-90"
          >
            <StickerArt id={s.id} size={72} />
          </button>
        ))}
      </div>
    </div>
  );
}
