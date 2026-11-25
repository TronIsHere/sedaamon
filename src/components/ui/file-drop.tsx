"use client";

import { useRef, useState, type ReactNode } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

/** A place to drop files or pick them, handing them over at once. From the VibeFarsi file-upload, restyled for this app. */
export default function FileDrop({
  accept,
  busy,
  hint,
  onFiles,
}: {
  accept?: string;
  busy?: boolean;
  hint?: ReactNode;
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    if (list?.length && !busy) onFiles([...list]);
  };
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed p-5 text-center transition-colors",
          over ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin text-muted" /> : <FileUp className="size-5 text-muted" />}
        <span className="text-sm">
          فایل را اینجا رها کنید یا <span className="font-medium underline underline-offset-4">انتخاب کنید</span>
        </span>
        {hint && <span className="text-xs leading-6 text-muted">{hint}</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          // So the same file can be picked again.
          e.target.value = "";
        }}
      />
    </>
  );
}
