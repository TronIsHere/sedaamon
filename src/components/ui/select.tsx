import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";

/**
 * A native <select> (keyboard, screen readers and phone pickers keep working) drawn like our text
 * fields, with the chevron at the inline end. From the VibeFarsi select, restyled for this app.
 */
export default function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn("field appearance-none pe-10 disabled:cursor-not-allowed disabled:opacity-50", className)}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
