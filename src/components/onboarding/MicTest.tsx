"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/format";
import { canUseMic, micErrorMessage } from "@/lib/voice";
import Select from "@/components/ui/select";

/** Cells in the LED meter, and the level (0–1) that counts as "we heard you". */
const CELLS = 24;
const HEARD_AT = 0.18;

type State = { kind: "idle" } | { kind: "asking" } | { kind: "live" } | { kind: "error"; message: string };

/**
 * Asks for the microphone and shows how loud it hears the person on an LED strip, the same pixel look as
 * the sign-in art. Nothing is recorded or sent; the stream stops as soon as the step is left.
 */
export default function MicTest({ onHeard }: { onHeard: () => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const stop = useRef<() => void>(() => {});
  const onHeardRef = useRef(onHeard);

  useEffect(() => {
    onHeardRef.current = onHeard;
  }, [onHeard]);
  useEffect(() => () => stop.current(), []);

  async function start(id = deviceId) {
    stop.current();
    if (!canUseMic()) return setState({ kind: "error", message: micErrorMessage(null) });
    setState({ kind: "asking" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);

      let raf = 0;
      let smooth = 0;
      let reported = false;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        // Speech sits around 0.02–0.2 RMS; stretch that over the meter and let it fall back slowly.
        const now = Math.min(1, Math.sqrt(sum / samples.length) * 5);
        smooth = Math.max(now, smooth * 0.9);
        setLevel(smooth);
        if (!reported && smooth > HEARD_AT) {
          reported = true;
          setHeard(true);
          onHeardRef.current();
        }
      };
      raf = requestAnimationFrame(tick);
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        setLevel(0);
      };

      setDeviceId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? id);
      // Labels are only filled in once permission is granted.
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId));
      setState({ kind: "live" });
    } catch (err) {
      setState({ kind: "error", message: micErrorMessage(err) });
    }
  }

  const lit = Math.round(level * CELLS);

  return (
    <div className="rounded-[2rem] bg-ink-850 p-2">
      <div className="flex flex-col items-center gap-6 rounded-3xl bg-ink-800 px-4 py-8 sm:px-8">
        <div className="relative grid size-24 place-items-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-accent-strong/20 transition-transform duration-100"
            style={{ transform: `scale(${1 + level * 0.6})` }}
          />
          <span
            className={cn(
              "relative grid size-20 place-items-center rounded-full transition-colors duration-200",
              state.kind === "live" ? "bg-accent-strong text-on-accent" : "bg-ink-700 text-fg",
            )}
          >
            {state.kind === "error" ? <MicOff className="size-8" /> : <Mic className="size-8" />}
          </span>
        </div>

        {/* LED meter. Reads left-to-right like any level meter, whatever the page direction. */}
        <div dir="ltr" role="meter" aria-label="بلندی صدای میکروفون" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} className="flex w-full max-w-sm gap-1">
          {Array.from({ length: CELLS }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-6 flex-1 rounded-[3px] transition-colors duration-75",
                i < lit ? (i >= CELLS - 4 ? "bg-danger" : "bg-accent-strong") : "bg-ink-700",
              )}
            />
          ))}
        </div>

        <p aria-live="polite" className="min-h-6 text-center text-sm">
          {state.kind === "idle" && <span className="text-muted">دسترسی بدهید و چند کلمه حرف بزنید.</span>}
          {state.kind === "asking" && <span className="text-muted">منتظر اجازه‌ی مرورگر…</span>}
          {state.kind === "live" &&
            (heard ? <span className="font-medium text-accent">صدایتان واضح می‌رسد. آماده‌اید!</span> : <span className="text-muted">چیزی بگویید، مثلاً «سلام صدامون».</span>)}
          {state.kind === "error" && <span className="text-danger">{state.message}</span>}
        </p>

        {state.kind === "live" ? (
          devices.length > 1 && (
            <label className="w-full max-w-sm space-y-1.5">
              <span className="text-sm font-medium text-muted">میکروفون</span>
              <Select
                value={deviceId}
                onChange={(e) => {
                  setHeard(false);
                  void start(e.target.value);
                }}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `میکروفون ${i + 1}`}
                  </option>
                ))}
              </Select>
            </label>
          )
        ) : (
          <button type="button" className="btn-primary" onClick={() => start()} disabled={state.kind === "asking"}>
            {state.kind === "asking" ? <Loader2 className="size-4 animate-spin" /> : state.kind === "error" ? <RotateCcw className="size-4" /> : <Mic className="size-4" />}
            {state.kind === "error" ? "دوباره امتحان کنید" : "شروع تست میکروفون"}
          </button>
        )}
      </div>
    </div>
  );
}
