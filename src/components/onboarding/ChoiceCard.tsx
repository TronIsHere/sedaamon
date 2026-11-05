import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/format";

/**
 * One answer to an onboarding question: a raised tile that turns lime with a check when picked.
 * `centered` lays it out as icon-over-title (short labels); otherwise the icon sits on top with a lead line under the title.
 */
export default function ChoiceCard({
  icon: Icon,
  title,
  lead,
  selected,
  multiple = false,
  centered = false,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  lead?: string;
  selected: boolean;
  multiple?: boolean;
  centered?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "relative flex min-h-44 min-w-0 snap-start flex-col rounded-3xl p-4 text-start transition-[background-color,color,transform,box-shadow] duration-200 ease-out-soft active:scale-[0.98]",
        centered && "items-center justify-center gap-4 text-center",
        selected ? "bg-accent-strong text-on-accent shadow-glow" : "bg-ink-800 hover:bg-ink-700",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute end-3 top-3 grid size-6 place-items-center rounded-lg transition-colors duration-200",
          selected ? "bg-on-accent text-accent-strong" : "ring-1 ring-white/15",
        )}
      >
        {selected && <Check className="animate-pop-in size-4" strokeWidth={3} />}
      </span>

      <Icon aria-hidden className={cn("size-8 shrink-0", selected ? "text-on-accent" : "text-accent-strong")} strokeWidth={1.75} />
      <span className={cn("font-semibold leading-snug text-balance", !centered && "mt-auto pt-6")}>{title}</span>
      {lead && (
        <span className={cn("mt-2 text-xs leading-6", selected ? "text-on-accent/75" : "text-muted")}>{lead}</span>
      )}
    </button>
  );
}
