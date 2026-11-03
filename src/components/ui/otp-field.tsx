"use client";

import { useRef } from "react";
import { cn } from "@/lib/format";
import { toLatinDigits, toPersianDigits } from "@/lib/phone";

/**
 * One box per digit, laid out left to right like the SMS, showing Persian digits while the value
 * stays Latin. Pasting a full code fills every box; Backspace on an empty box steps back.
 * From the VibeFarsi OTP field, restyled for this app.
 */
export default function OtpField({
  length,
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  label = "کد تأیید",
}: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string) => {
    const code = toLatinDigits(next).replace(/\D/g, "").slice(0, length);
    onChange(code);
    if (code.length === length) onComplete?.(code);
    refs.current[Math.min(code.length, length - 1)]?.focus();
  };

  return (
    <div dir="ltr" role="group" aria-label={label} className="flex justify-center gap-2">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`${label}، رقم ${toPersianDigits(i + 1)}`}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={value[i] ? toPersianDigits(value[i]) : ""}
          onChange={(e) => {
            const typed = toLatinDigits(e.target.value).replace(/\D/g, "");
            // More than one digit means a paste (or the SMS autofill): it replaces from this box on.
            commit(value.slice(0, i) + typed + (typed.length > 1 ? "" : value.slice(i + 1)));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              e.preventDefault();
              commit(value.slice(0, i - 1));
            }
            if (e.key === "ArrowLeft") refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight") refs.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className={cn("field w-11! shrink-0 px-0! text-center text-xl font-bold tabular-nums caret-transparent", "disabled:opacity-50")}
        />
      ))}
    </div>
  );
}
