"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent, type RemoteParticipant } from "livekit-client";
import { AlertTriangle, FileVideo, Play, X } from "lucide-react";
import { toPersianDigits } from "@/lib/phone";

/**
 * Watch together without any media server: every person plays their own copy of the same video file, and the
 * room only passes around "play / pause / seek here" messages over LiveKit's data channel. Nothing but a few
 * bytes of JSON crosses the network, which is what makes it work on weak connections.
 */

const TOPIC = "watch";
/** The starter repeats the position this often while playing, so small drifts get corrected. */
const HEARTBEAT_MS = 5000;
/** Events fired within this long of us changing the video ourselves are echoes, not people. */
const ECHO_MS = 1000;

type Wire =
  | { t: "open"; id: string; name: string; size: number; duration: number }
  | { t: "state"; id: string; playing: boolean; time: number; beat?: boolean }
  | { t: "close"; id: string }
  | { t: "hello" };

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7;

/** Everything from the network is untrusted: only well-formed messages get through. */
function parse(payload: Uint8Array): Wire | null {
  try {
    const m = JSON.parse(new TextDecoder().decode(payload));
    if (!m || typeof m !== "object") return null;
    if (m.t === "hello") return { t: "hello" };
    if (!isText(m.id, 64)) return null;
    if (m.t === "close") return { t: "close", id: m.id };
    if (m.t === "state" && typeof m.playing === "boolean" && isNum(m.time)) return { t: "state", id: m.id, playing: m.playing, time: m.time, beat: m.beat === true };
    if (m.t === "open" && isText(m.name, 200) && isNum(m.size) && isNum(m.duration)) return { t: "open", id: m.id, name: m.name, size: m.size, duration: m.duration };
  } catch {}
  return null;
}

export interface WatchSession {
  id: string;
  name: string;
  size: number;
  duration: number;
  startedBy: { id: string; name: string };
}

/** Where the shared video is, as of `at` (a local clock reading). `beat` marks the starter's periodic correction. */
export interface Playback {
  playing: boolean;
  time: number;
  at: number;
  beat: boolean;
}

const IDLE: Playback = { playing: false, time: 0, at: 0, beat: false };

export const expectedTime = (p: Playback) => (p.playing ? p.time + (Date.now() - p.at) / 1000 : p.time);

interface Local {
  file: File;
  url: string;
}

interface WatchApi {
  session: WatchSession | null;
  /** Our own copy of the file, once we picked it. */
  local: Local | null;
  playback: Playback;
  isStarter: boolean;
  /** Starts a session with this file. Rejects with a message when the browser can't play it. */
  start: (file: File) => Promise<void>;
  /** Picks our copy of the file for a session someone else started. */
  join: (file: File) => void;
  control: (next: { playing: boolean; time: number }) => void;
  /** The starter ends it for everyone; anyone else just stops watching. */
  stop: () => void;
}

const WatchContext = createContext<WatchApi | null>(null);

export const useWatch = () => {
  const api = useContext(WatchContext);
  if (!api) throw new Error("useWatch needs a WatchProvider");
  return api;
};

function probeDuration(url: string) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => (Number.isFinite(video.duration) ? resolve(video.duration) : reject(new Error("unknown length")));
    video.onerror = () => reject(new Error("unsupported"));
    video.src = url;
  });
}

export function WatchProvider({ onNotify, children }: { onNotify: (message: string) => void; children: ReactNode }) {
  const room = useRoomContext();
  const [session, setSession] = useState<WatchSession | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [playback, setPlayback] = useState<Playback>(IDLE);
  const sessionRef = useRef(session);
  const playbackRef = useRef(playback);
  const localRef = useRef(local);
  /** Sessions we walked away from, so the starter's next heartbeat doesn't pull us back in. */
  const left = useRef(new Set<string>());

  useEffect(() => {
    sessionRef.current = session;
    playbackRef.current = playback;
    localRef.current = local;
  });
  useEffect(
    () => () => {
      if (localRef.current) URL.revokeObjectURL(localRef.current.url);
    },
    [],
  );

  const send = useCallback(
    (msg: Wire, to?: string) => {
      if (room.state !== ConnectionState.Connected) return;
      room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true, topic: TOPIC, destinationIdentities: to ? [to] : undefined })
        .catch(() => {});
    },
    [room],
  );

  const clear = useCallback(() => {
    if (localRef.current) URL.revokeObjectURL(localRef.current.url);
    setLocal(null);
    setSession(null);
    setPlayback(IDLE);
  }, []);

  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== TOPIC || !participant) return;
      const msg = parse(payload);
      if (!msg) return;
      const current = sessionRef.current;

      if (msg.t === "hello") {
        // Someone just joined the call; bring them up to date.
        if (!current) return;
        send({ t: "open", id: current.id, name: current.name, size: current.size, duration: current.duration }, participant.identity);
        const p = playbackRef.current;
        send({ t: "state", id: current.id, playing: p.playing, time: expectedTime(p) }, participant.identity);
      } else if (msg.t === "open") {
        if (current?.id === msg.id || left.current.has(msg.id)) return;
        if (localRef.current) URL.revokeObjectURL(localRef.current.url);
        setLocal(null);
        setPlayback(IDLE);
        setSession({
          id: msg.id,
          name: msg.name,
          size: msg.size,
          duration: msg.duration,
          startedBy: { id: participant.identity, name: participant.name || participant.identity },
        });
        onNotify(`${participant.name || "یکی از اعضا"} تماشای هم‌زمان «${msg.name}» را شروع کرد`);
      } else if (msg.t === "state") {
        if (current?.id === msg.id) setPlayback({ playing: msg.playing, time: msg.time, at: Date.now(), beat: !!msg.beat });
      } else if (msg.t === "close") {
        if (current?.id === msg.id && current.startedBy.id === participant.identity) {
          clear();
          onNotify("تماشای هم‌زمان به پایان رسید");
        }
      }
    };
    const onConnected = () => send({ t: "hello" });
    const onDisconnected = () => {
      left.current.clear();
      clear();
    };
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, send, clear, onNotify]);

  // The identity only exists once connected, so read it when needed rather than caching it.
  const isStarter = !!session && session.startedBy.id === room.localParticipant.identity;

  // Only the starter repeats the position, so there is one clock to follow.
  useEffect(() => {
    if (!isStarter || !playback.playing || !session) return;
    const timer = window.setInterval(() => {
      const p = playbackRef.current;
      send({ t: "state", id: session.id, playing: p.playing, time: expectedTime(p), beat: true });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [isStarter, playback.playing, session, send]);

  const start = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      let duration: number;
      try {
        duration = await probeDuration(url);
      } catch {
        URL.revokeObjectURL(url);
        throw new Error("این فایل در مرورگر شما پخش نمی‌شود. فایل MP4 یا WebM انتخاب کنید");
      }
      if (localRef.current) URL.revokeObjectURL(localRef.current.url);
      // Not crypto.randomUUID(): that only exists on HTTPS pages, and this should also work on a LAN test server.
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      setLocal({ file, url });
      setSession({ id, name: file.name.slice(0, 200), size: file.size, duration, startedBy: { id: room.localParticipant.identity, name: room.localParticipant.name || "شما" } });
      setPlayback({ playing: false, time: 0, at: Date.now(), beat: false });
      send({ t: "open", id, name: file.name.slice(0, 200), size: file.size, duration });
      send({ t: "state", id, playing: false, time: 0 });
    },
    [room, send],
  );

  const join = useCallback((file: File) => {
    if (localRef.current) URL.revokeObjectURL(localRef.current.url);
    setLocal({ file, url: URL.createObjectURL(file) });
  }, []);

  const control = useCallback(
    (next: { playing: boolean; time: number }) => {
      const current = sessionRef.current;
      if (!current) return;
      setPlayback({ ...next, at: Date.now(), beat: false });
      send({ t: "state", id: current.id, ...next });
    },
    [send],
  );

  const stop = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    if (current.startedBy.id === room.localParticipant.identity) send({ t: "close", id: current.id });
    else left.current.add(current.id);
    clear();
  }, [room, send, clear]);

  return <WatchContext.Provider value={{ session, local, playback, isStarter, start, join, control, stop }}>{children}</WatchContext.Provider>;
}

const mb = (bytes: number) => toPersianDigits((bytes / 1_048_576).toFixed(bytes > 10_485_760 ? 0 : 1));
const clock = (seconds: number) => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, "0");
  return toPersianDigits(h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`);
};

/** The shared video, with the browser's own controls. Whatever anyone does with them is mirrored for everyone. */
export function WatchPanel() {
  const { session, local, playback, isStarter, join, control, stop } = useWatch();
  const video = useRef<HTMLVideoElement>(null);
  const echoUntil = useRef(0);
  const [blocked, setBlocked] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  /** Moves our copy to where the room is. */
  const follow = useCallback(() => {
    const v = video.current;
    if (!v) return;
    const target = expectedTime(playback);
    echoUntil.current = Date.now() + ECHO_MS;
    // Corrections from the starter's heartbeat tolerate a little drift; a person's seek or pause doesn't.
    if (Math.abs(v.currentTime - target) > (playback.beat ? 1.2 : 0.3)) v.currentTime = target;
    if (playback.playing && v.paused) {
      v.play().then(() => setBlocked(false), () => setBlocked(true));
    } else if (!playback.playing && !v.paused) {
      v.pause();
    }
  }, [playback]);

  useEffect(() => {
    if (local) follow();
  }, [local, follow]);

  if (!session) return null;

  const mine = () => Date.now() > echoUntil.current;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-3xl bg-ink-900/80 p-3 ring-1 ring-white/5" aria-label="تماشای هم‌زمان">
      <div className="flex items-center gap-2 px-1">
        <FileVideo className="size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 leading-5">
          <p dir="auto" className="truncate text-sm font-semibold">
            {session.name}
          </p>
          <p className="truncate text-xs text-muted">
            {isStarter ? "شما شروع کردید" : `${session.startedBy.name} شروع کرد`} · {clock(session.duration)} · {mb(session.size)} مگابایت
          </p>
        </div>
        <button
          onClick={stop}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-ink-800 hover:text-danger"
          title={isStarter ? "پایان برای همه" : "ترک تماشا"}
        >
          <X className="size-4" />
          {isStarter ? "پایان برای همه" : "ترک"}
        </button>
      </div>

      {!local ? (
        <div className="grid flex-1 place-items-center rounded-2xl bg-ink-950 p-6 text-center">
          <div className="max-w-sm">
            <FileVideo className="mx-auto size-10 text-accent" />
            <p className="mt-3 text-sm leading-7">
              برای تماشای هم‌زمان، <b dir="auto">{session.name}</b> را از روی دستگاه خودتان انتخاب کنید. فایل باید همان فایلی باشد که {session.startedBy.name} انتخاب کرده است.
            </p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-strong/30 hover:bg-accent">
              انتخاب فایل
              <input type="file" accept="video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && join(e.target.files[0])} />
            </label>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black" dir="ltr">
          <video
            ref={video}
            src={local.url}
            controls
            playsInline
            preload="auto"
            className="max-h-full max-w-full"
            onLoadedMetadata={(e) => {
              setProblem(null);
              setMismatch(local.file.size !== session.size || Math.abs(e.currentTarget.duration - session.duration) > 1.5);
              follow();
            }}
            onError={() => setProblem("این فایل در مرورگر شما پخش نمی‌شود")}
            onPlay={(e) => mine() && control({ playing: true, time: e.currentTarget.currentTime })}
            onPause={(e) => mine() && !e.currentTarget.ended && control({ playing: false, time: e.currentTarget.currentTime })}
            onSeeked={(e) => mine() && control({ playing: !e.currentTarget.paused, time: e.currentTarget.currentTime })}
          />
          {blocked && playback.playing && (
            <button
              onClick={() => video.current?.play().then(() => setBlocked(false), () => {})}
              className="absolute inset-0 grid place-items-center bg-black/60 text-white"
              dir="rtl"
            >
              <span className="flex items-center gap-2 rounded-full bg-accent-strong px-5 py-3 font-semibold shadow-xl">
                <Play className="size-5" />
                برای پخش بزنید
              </span>
            </button>
          )}
        </div>
      )}

      {(problem || mismatch) && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs leading-6 text-amber-200 ring-1 ring-amber-400/20">
          <AlertTriangle className="mt-1 size-3.5 shrink-0" />
          {problem ?? "این فایل با فایل اشتراکی یکی به نظر نمی‌رسد (اندازه یا مدت‌زمان فرق دارد) و ممکن است هماهنگ پخش نشود."}
        </p>
      )}
      <p className="px-1 text-[11px] leading-5 text-muted">صدای فیلم از دستگاه خودتان پخش می‌شود. برای جلوگیری از پژواک در تماس، از هدفون استفاده کنید.</p>
    </section>
  );
}
