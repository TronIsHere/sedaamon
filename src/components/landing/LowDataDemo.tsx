"use client";

import { useState } from "react";
import { Mic, WifiOff } from "lucide-react";

const PEOPLE = [
  { name: "سارا", from: "#e6f7a3", to: "#a0b23f" },
  { name: "امید", from: "#4a4a4a", to: "#272727" },
  { name: "نگار", from: "#def48c", to: "#6f7a2e" },
  { name: "کاوه", from: "#333333", to: "#161616" },
];

/** A toy voice call that shows what low-data mode does: video tiles fall back to avatars, audio stays on. */
export default function LowDataDemo() {
  const [lowData, setLowData] = useState(false);

  return (
    <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
        <div className="flex min-h-28 flex-col justify-between rounded-2xl bg-(--lime) p-4">
          <span className="text-xs font-medium">صدا</span>
          <span className="text-3xl font-light sm:text-4xl">روشن</span>
        </div>
        <div
          className={`flex min-h-28 flex-col justify-between rounded-2xl p-4 transition-colors duration-300 ${
            lowData ? "bg-(--raised-2) text-(--muted)" : "bg-(--raised) text-(--fg)"
          }`}
        >
          <span className="text-xs font-medium">تصویر</span>
          <span className="text-3xl font-light sm:text-4xl">{lowData ? "خاموش" : "روشن"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="حالت تماس" className="flex self-start rounded-full border border-(--hair) p-1 text-xs">
          {[
            { value: false, label: "حالت معمولی" },
            { value: true, label: "حالت کم‌مصرف" },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={lowData === option.value}
              onClick={() => setLowData(option.value)}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                lowData === option.value ? "bg-(--lime-strong) font-bold text-(--ink)" : "hover:bg-(--raised)"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2">
          {PEOPLE.map((p, i) => (
            <div
              key={p.name}
              className="relative grid aspect-video place-items-center overflow-hidden rounded-xl transition-[background] duration-500"
              style={{
                background: lowData ? "var(--raised-2)" : `linear-gradient(135deg, ${p.from}, ${p.to})`,
              }}
            >
              <span
                className={`grid size-10 place-items-center rounded-full text-sm font-bold transition-colors duration-500 ${
                  lowData ? "bg-(--raised) text-(--muted)" : "bg-black/25 text-white"
                }`}
              >
                {p.name[0]}
              </span>
              <span
                className={`absolute start-2 bottom-1.5 flex items-center gap-1 text-[11px] font-medium ${
                  lowData ? "text-(--muted)" : "text-white drop-shadow"
                }`}
              >
                {i === 0 && <Mic className="size-3" aria-hidden />}
                {p.name}
              </span>
            </div>
          ))}
        </div>

        <p className="flex items-center gap-2 text-xs text-(--muted)" aria-live="polite">
          {lowData && <WifiOff className="size-3.5 shrink-0" aria-hidden />}
          {lowData
            ? "تصویر دریافت نمی‌شود و همه‌ی پهنای باند صرف صدا می‌شود."
            : "با اینترنت کند، یک دکمه تصویر را قطع می‌کند و صدا را نگه می‌دارد."}
        </p>
      </div>
    </div>
  );
}
