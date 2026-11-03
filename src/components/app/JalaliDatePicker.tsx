"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/format";
import {
  faDigits,
  formatJalali,
  JALALI_MONTHS,
  JALALI_WEEKDAYS_SHORT,
  jalaliMonthLength,
  jalaliWeekday,
  toGregorian,
  toJalali,
} from "@/lib/jalali";

const sameDay = (a: Date | null | undefined, b: Date) =>
  !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * A Jalali month grid (the week starts on شنبه, Fridays are dimmed, today has a ring) that reports plain Dates.
 * Based on the VibeFarsi calendar, restyled for this app's colours.
 */
export function JalaliCalendar({ value, onChange, min }: { value: Date | null; onChange: (date: Date) => void; min?: Date }) {
  const today = new Date();
  const start = toJalali(value ?? today);
  const [view, setView] = useState({ jy: start.jy, jm: start.jm });

  const offset = jalaliWeekday(toGregorian(view.jy, view.jm, 1));
  const cells = Array.from({ length: offset + jalaliMonthLength(view.jy, view.jm) }, (_, i) => (i < offset ? null : i - offset + 1));
  const floor = min && startOfDay(min);

  const move = (delta: number) =>
    setView(({ jy, jm }) => {
      const next = jm + delta;
      if (next < 1) return { jy: jy - 1, jm: 12 };
      if (next > 12) return { jy: jy + 1, jm: 1 };
      return { jy, jm: next };
    });

  const nav = "grid size-9 place-items-center rounded-lg text-muted transition hover:bg-ink-800 hover:text-fg";

  return (
    <div className="rounded-xl bg-ink-950 p-3 ring-1 ring-white/5" role="group" aria-label="تقویم شمسی">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold">
          {JALALI_MONTHS[view.jm - 1]} {faDigits(view.jy)}
        </span>
        <div className="flex gap-0.5">
          {/* In a right-to-left page "previous" is on the right. */}
          <button type="button" aria-label="ماه قبل" onClick={() => move(-1)} className={nav}>
            <ChevronRight className="size-4" />
          </button>
          <button type="button" aria-label="ماه بعد" onClick={() => move(1)} className={nav}>
            <ChevronLeft className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-xs" role="grid">
        {JALALI_WEEKDAYS_SHORT.map((d) => (
          <span key={d} className="py-1 text-muted/80" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} className="h-9" />;
          const date = toGregorian(view.jy, view.jm, d);
          const selected = sameDay(value, date);
          const disabled = !!floor && date < floor;
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              aria-selected={selected}
              aria-label={`${faDigits(d)} ${JALALI_MONTHS[view.jm - 1]}`}
              disabled={disabled}
              onClick={() => onChange(date)}
              className={cn(
                "h-9 w-full rounded-lg leading-none tabular-nums transition",
                selected && "bg-accent-strong font-semibold text-white",
                !selected && sameDay(today, date) && "ring-1 ring-inset ring-fg/40",
                !selected && i % 7 === 6 && "text-muted/60",
                !selected && !disabled && "hover:bg-ink-800",
                disabled && "cursor-not-allowed opacity-30",
              )}
            >
              {faDigits(d)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A field showing the chosen date as «چهارشنبه، ۲۵ شهریور ۱۴۰۵»; tapping it opens the calendar underneath. */
export default function JalaliDatePicker({
  value,
  onChange,
  min,
  label,
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  min?: Date;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/5 bg-ink-950 px-3 py-2.5 text-start outline-none focus-visible:border-accent"
      >
        <CalendarDays className="size-4 shrink-0 text-muted" />
        <span className={cn("truncate", !value && "text-muted/60")}>{value ? formatJalali(value, { weekday: true }) : "انتخاب تاریخ"}</span>
      </button>
      {open && (
        <JalaliCalendar
          value={value}
          min={min}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
