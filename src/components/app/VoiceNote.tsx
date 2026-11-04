"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Pause, Play, RotateCw, X } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/attachments";
import { cn } from "@/lib/format";
import { useRevealed } from "@/lib/media";
import { toPersianDigits } from "@/lib/phone";
import { canRecordVoice, startRecording, VOICE_NOTE_MAX_MS, VOICE_NOTE_MIN_MS, type Recording, type VoiceNote } from "@/lib/recorder";
import type { AttachmentDTO } from "@/lib/types";

/** Moving the finger this far from the button while holding it throws the recording away on release. */
const CANCEL_DISTANCE = 80;
const HOLD_HINT = "برای ضبط پیام صوتی، دکمه را نگه دارید";

export interface RecordingState {
  startedAt: number;
  /** Released now, the note would be thrown away. */
  cancelling: boolean;
}

const noSubscribe = () => () => {};

/** Recording needs the microphone, which browsers only offer on HTTPS (and localhost). Always false while rendering on the server. */
export function useCanRecordVoice() {
  return useSyncExternalStore(noSubscribe, canRecordVoice, () => false);
}

/**
 * Hold to record, release to send; slide away before releasing to cancel. Space or Enter work the same way from the
 * keyboard, and Esc cancels.
 */
export function VoiceRecordButton({
  sending,
  onRecording,
  onRecorded,
  onError,
}: {
  sending: boolean;
  onRecording: (state: RecordingState | null) => void;
  onRecorded: (note: VoiceNote) => void;
  onError: (message: string) => void;
}) {
  const recording = useRef<Recording | null>(null);
  /** The button is down: still wanted once the microphone is ready. */
  const held = useRef(false);
  const cancelling = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const maxTimer = useRef(0);
  const [active, setActive] = useState(false);

  const finish = async (send: boolean) => {
    held.current = false;
    window.clearTimeout(maxTimer.current);
    const current = recording.current;
    recording.current = null;
    // Released while the microphone was still starting: `begin` drops it when it arrives.
    if (!current) return;
    setActive(false);
    onRecording(null);
    if (!send) return current.cancel();
    if (Date.now() - current.startedAt < VOICE_NOTE_MIN_MS) {
      current.cancel();
      return onError(HOLD_HINT);
    }
    try {
      onRecorded(await current.stop());
    } catch (err) {
      onError((err as Error).message);
    }
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  const begin = async () => {
    if (held.current || sending) return;
    held.current = true;
    cancelling.current = false;
    let started: Recording;
    try {
      started = await startRecording();
    } catch {
      held.current = false;
      return onError("میکروفون در دسترس نیست. اجازهٔ استفاده از میکروفون را در مرورگر بدهید");
    }
    // Let go before the microphone was ready (often while the browser asked for permission).
    if (!held.current) {
      started.cancel();
      return onError(HOLD_HINT);
    }
    recording.current = started;
    setActive(true);
    onRecording({ startedAt: started.startedAt, cancelling: false });
    maxTimer.current = window.setTimeout(() => void finishRef.current(true), VOICE_NOTE_MAX_MS);
  };

  // Esc cancels, and leaving the channel mid-recording throws the recording away.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && void finishRef.current(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
  useEffect(() => () => recording.current?.cancel(), []);

  return (
    <button
      type="button"
      aria-label="پیام صوتی: برای ضبط نگه دارید"
      title="برای ضبط نگه دارید، برای ارسال رها کنید"
      disabled={sending}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = { x: e.clientX, y: e.clientY };
        void begin();
      }}
      onPointerMove={(e) => {
        if (!recording.current) return;
        const far = Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > CANCEL_DISTANCE;
        if (far === cancelling.current) return;
        cancelling.current = far;
        onRecording({ startedAt: recording.current.startedAt, cancelling: far });
      }}
      onPointerUp={() => void finish(!cancelling.current)}
      onPointerCancel={() => void finish(false)}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          void begin();
        }
      }}
      onKeyUp={(e) => (e.key === " " || e.key === "Enter") && void finish(true)}
      // A long press would otherwise open the context menu or select text on phones.
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none", WebkitTouchCallout: "none" }}
      className={cn(
        "grid size-10 shrink-0 select-none place-items-center rounded-full transition active:scale-95",
        active ? "scale-125 bg-danger-strong text-white" : "text-muted hover:bg-ink-700 hover:text-fg",
      )}
    >
      {sending ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
    </button>
  );
}

/** Shown over the text box while recording: a running clock and how to cancel. */
export function RecordingBar({ state }: { state: RecordingState }) {
  const [now, setNow] = useState(state.startedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div
      role="status"
      className={cn(
        "absolute inset-y-0 start-0 end-12 z-10 flex items-center gap-3 rounded-[1.75rem] bg-ink-800 ps-5 text-sm",
        state.cancelling && "text-danger",
      )}
    >
      {state.cancelling ? <X className="size-4 shrink-0" /> : <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-danger" />}
      <span className="font-semibold tabular-nums">{formatDuration((now - state.startedAt) / 1000)}</span>
      <span className="min-w-0 truncate text-xs text-muted">
        {state.cancelling ? "رها کنید تا لغو شود" : "رها کنید تا ارسال شود · برای لغو، انگشت را دور کنید"}
      </span>
    </div>
  );
}

/** The note that is playing, so starting another one stops it. */
let playing: HTMLAudioElement | null = null;
const RATES = [1, 1.5, 2];
const FLAT = Array.from({ length: 48 }, () => 6);

/**
 * A voice note in a message. Nothing is downloaded until play is pressed (`preload="none"`); before that the length,
 * size and waveform come from the message itself.
 */
export function VoiceNotePlayer({ note }: { note: AttachmentDTO }) {
  const local = useRevealed(note.url);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "playing" | "paused" | "failed">("idle");
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
  const [retry, setRetry] = useState(0);
  const duration = note.duration ?? 0;
  const progress = duration ? Math.min(1, position / duration) : 0;
  const bars = note.waveform?.length ? note.waveform : FLAT;
  const started = phase !== "idle" || position > 0;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) return audio.pause();
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    audio.playbackRate = rate;
    setPhase((p) => (p === "paused" ? p : "loading"));
    audio.play().catch((err: Error) => err.name !== "AbortError" && setPhase("failed"));
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="flex w-72 max-w-full items-center gap-2.5 rounded-2xl bg-ink-800 p-2 pe-3 ring-1 ring-line">
      <audio
        ref={audioRef}
        key={retry}
        // A new address makes the browser try again instead of reusing the failure.
        src={(local ?? note.url) + (retry && !local ? `?retry=${retry}` : "")}
        preload="none"
        onPlaying={() => setPhase("playing")}
        onWaiting={() => setPhase("loading")}
        onPause={(e) => !e.currentTarget.ended && setPhase("paused")}
        onEnded={() => {
          setPhase("idle");
          setPosition(0);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onError={() => setPhase("failed")}
      />
      <button
        onClick={() => {
          if (phase !== "failed") return toggle();
          setPhase("idle");
          setRetry((n) => n + 1);
        }}
        aria-label={phase === "playing" ? "توقف" : phase === "failed" ? "تلاش دوباره" : "پخش پیام صوتی"}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-strong text-on-accent transition hover:brightness-105 active:scale-95"
      >
        {phase === "loading" ? (
          <Loader2 className="size-5 animate-spin" />
        ) : phase === "playing" ? (
          <Pause className="size-5 fill-current" />
        ) : phase === "failed" ? (
          <RotateCw className="size-5" />
        ) : (
          <Play className="size-5 translate-x-px fill-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div aria-hidden className="flex h-6 items-center gap-[2px] overflow-hidden">
          {bars.map((v, i) => (
            <span
              key={i}
              className={cn("w-[3px] shrink-0 rounded-full transition-colors", (i + 0.5) / bars.length <= progress ? "bg-accent" : "bg-ink-600")}
              style={{ height: `${Math.max(3, Math.round((v / 31) * 24))}px` }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted tabular-nums">
          <span>{formatDuration(started ? position : duration)}</span>
          {/* Before the first play, the size says what pressing play will cost. */}
          {!started && !local && <span>· {formatBytes(note.size)}</span>}
          {phase === "failed" && <span className="text-danger">· پخش نشد</span>}
        </div>
      </div>

      <button
        onClick={cycleRate}
        aria-label={`سرعت پخش ${toPersianDigits(rate)} برابر`}
        className="shrink-0 rounded-full bg-ink-700 px-2 py-0.5 text-[11px] font-semibold text-muted tabular-nums hover:text-fg"
      >
        {toPersianDigits(rate)}×
      </button>
    </div>
  );
}
