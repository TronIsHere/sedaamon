"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/format";
import { formatNational, mobileOperator, nationalDigits } from "@/lib/phone";

/**
 * Iranian mobile field: a fixed +98, the number grouped 3-3-4, the operator named as soon as it is
 * known, and Persian digits or a leading zero accepted. Reports the 10 national digits («912…»).
 * From the VibeFarsi phone input, restyled for this app.
 */
export default function PhoneInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (digits: string) => void;
  autoFocus?: boolean;
}) {
  const digits = nationalDigits(value);
  const valid = /^9\d{9}$/.test(digits);
  const invalid = digits.length === 10 && !valid;
  const operator = mobileOperator(digits);

  return (
    <div className="space-y-1.5">
      <div
        dir="ltr"
        className={cn(
          "field flex items-center gap-2 focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent-strong)_18%,transparent)]",
          invalid && "border-danger/60",
        )}
      >
        <span className="text-muted">+98</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          placeholder="912 345 6789"
          aria-label="شماره موبایل"
          aria-invalid={invalid || undefined}
          value={formatNational(digits)}
          onChange={(e) => onChange(nationalDigits(e.target.value))}
          className="min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted/60"
        />
        {valid && <Check aria-hidden className="size-4 text-online" />}
      </div>
      <p className={cn("text-xs", invalid ? "text-danger" : "text-muted")} aria-live="polite">
        {invalid ? "شماره باید با ۹ شروع شود و ۱۰ رقم باشد" : operator ? `اپراتور: ${operator}` : "صفر اول را لازم نیست بزنید"}
      </p>
    </div>
  );
}
