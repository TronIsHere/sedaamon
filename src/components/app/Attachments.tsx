"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, ImageDown, Loader2, RotateCw, X } from "lucide-react";
import { formatBytes } from "@/lib/attachments";
import { cn } from "@/lib/format";
import { revealMedia, useRevealed } from "@/lib/media";
import { useCloseOnBack } from "@/lib/mobile";
import type { AttachmentDTO } from "@/lib/types";
import { VoiceNotePlayer } from "./VoiceNote";

/** The largest a picture is drawn in the chat; tapping it opens it full size. */
const MAX_BOX = 320;
/** Several pictures side by side are drawn smaller. */
const MAX_BOX_MANY = 220;

/**
 * The pictures, voice notes and files of one message. Pictures wait for a tap and voice notes for play before they
 * are downloaded, to spare the reader's data.
 */
export default function MessageAttachments({ attachments }: { attachments: AttachmentDTO[] }) {
  const images = attachments.filter((a) => a.kind === "image");
  const voices = attachments.filter((a) => a.kind === "voice");
  const files = attachments.filter((a) => a.kind === "file");
  const [viewing, setViewing] = useState<AttachmentDTO | null>(null);

  return (
    <div className="mt-1 flex w-full flex-col items-start gap-1.5">
      {images.length > 0 && (
        <div className="flex max-w-full flex-wrap gap-1.5">
          {images.map((a) => (
            <ImageTile key={a.id} image={a} max={images.length > 1 ? MAX_BOX_MANY : MAX_BOX} onOpen={() => setViewing(a)} />
          ))}
        </div>
      )}
      {voices.map((a) => (
        <VoiceNotePlayer key={a.id} note={a} />
      ))}
      {files.map((a) => (
        <FileTile key={a.id} file={a} />
      ))}
      {viewing && <ImageViewer image={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function boxOf(image: AttachmentDTO, max: number) {
  // Without a known size (the browser couldn't measure it), a plain 4:3 box.
  const w = image.width ?? 240;
  const h = image.height ?? 180;
  const scale = Math.min(1, max / w, max / h);
  // Very thin pictures still get a box big enough to tap.
  return { width: Math.max(96, Math.round(w * scale)), height: Math.max(72, Math.round(h * scale)) };
}

function ImageTile({ image, max, onOpen }: { image: AttachmentDTO; max: number; onOpen: () => void }) {
  const src = useRevealed(image.url);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const box = boxOf(image, max);

  return (
    <div
      className="relative max-w-full overflow-hidden rounded-2xl bg-ink-800 ring-1 ring-line"
      style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}
    >
      {image.preview && state !== "loaded" && (
        // The stand-in is a few pixels wide; blurring hides the blocks.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.preview} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-lg" />
      )}

      {!src ? (
        <button
          onClick={() => revealMedia(image.url)}
          aria-label={`بارگذاری تصویر، ${formatBytes(image.size)}`}
          className="absolute inset-0 grid place-items-center bg-ink-950/20 transition-colors hover:bg-ink-950/10"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-ink-950/70 px-3 py-1.5 text-xs font-semibold text-fg backdrop-blur-sm">
            <ImageDown className="size-4" />
            {formatBytes(image.size)}
          </span>
        </button>
      ) : (
        <button onClick={onOpen} disabled={state !== "loaded"} aria-label={`نمایش ${image.name}`} className="absolute inset-0 size-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={image.name}
            onLoad={() => setState("loaded")}
            onError={() => setState("failed")}
            className={cn("size-full object-cover transition-opacity duration-300", state === "loaded" ? "opacity-100" : "opacity-0")}
          />
          {state === "loading" && (
            <span className="absolute inset-0 grid place-items-center">
              <Loader2 className="size-6 animate-spin text-fg/80" />
            </span>
          )}
        </button>
      )}

      {state === "failed" && (
        <button
          onClick={() => {
            setState("loading");
            // A new address makes the browser try again instead of reusing the failure.
            revealMedia(image.url, `${image.url}?retry=${Date.now()}`);
          }}
          className="absolute inset-0 grid place-items-center bg-ink-950/40"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-ink-950/70 px-3 py-1.5 text-xs font-semibold text-fg">
            <RotateCw className="size-4" />
            دوباره
          </span>
        </button>
      )}
    </div>
  );
}

function FileTile({ file }: { file: AttachmentDTO }) {
  return (
    <a
      href={file.url}
      download={file.name}
      className="flex w-72 max-w-full items-center gap-3 rounded-2xl bg-ink-800 p-2.5 pe-3 ring-1 ring-line transition-colors hover:bg-ink-700"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {file.name}
        </span>
        <span className="block text-xs text-muted">{formatBytes(file.size)}</span>
      </span>
      <Download className="size-4 shrink-0 text-muted" />
    </a>
  );
}

function ImageViewer({ image, onClose }: { image: AttachmentDTO; onClose: () => void }) {
  const src = useRevealed(image.url) ?? image.url;
  useCloseOnBack(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portalled out of the message, whose animation would otherwise make "fixed" relative to it. React still bubbles
  // events through portals, so taps are stopped here before they reach the message.
  return createPortal(
    <div
      role="dialog"
      aria-label={image.name}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-ink-950/95">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="بستن" className="grid size-11 place-items-center rounded-full text-fg hover:bg-ink-800">
          <X className="size-5" />
        </button>
        <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-muted">
          {image.name}
        </span>
        <a href={image.url} download={image.name} aria-label="دانلود" className="grid size-11 place-items-center rounded-full text-fg hover:bg-ink-800">
          <Download className="size-5" />
        </a>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={image.name} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
    </div>,
    document.body,
  );
}
