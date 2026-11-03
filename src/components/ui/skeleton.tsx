import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format";

/** A pulsing placeholder shaped like the content it stands in for. From the VibeFarsi skeleton. */
export default function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden className={cn("block animate-pulse bg-ink-800", className)} {...props} />;
}
