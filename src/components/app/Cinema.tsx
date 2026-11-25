"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParticipants } from "@livekit/components-react";
import {
  Captions,
  CaptionsOff,
  Check,
  Clapperboard,
  Film,
  Library,
  Loader2,
  Maximize,
  MicOff,
  Minimize,
  Pause,
  Play,
  Settings2,
  Square,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { defaultSubtitle, filmClock, subtitleLabels } from "@/lib/movies";
import { toPersianDigits } from "@/lib/phone";
import { getSocket } from "@/lib/socket";
import type { CinemaDTO, CinemaStateDTO, MovieDTO, SubtitleDTO, VoiceParticipant } from "@/lib/types";
import Avatar from "./Avatar";

/*
 * A cinema room: a voice call with a film from the app-wide library on top (only the site admin adds films). The film is streamed from this server
 * (with byte ranges, so seeking only fetches what's needed) and the server keeps the clock: it stores where the
 * film was at what time and whether it is playing, and every player follows that. Anyone in the room can play,
 * pause and seek; whoever changes something last wins.
 */

/** Our copy may drift this far (seconds) from the room's clock before it is pulled back. */
const DRIFT = 1;
/** After someone else's change we line up more tightly. */
const SNAP = 0.35;
const VOLUME_KEY = "sedaamon:cinema-volume";
/** "off", or the language last picked. Subtitles are each viewer's own choice, like the volume. */
const SUBTITLE_KEY = "sedaamon:cinema-subtitle";

/** Where the film should be right now, by the room's clock. */
const expectedAt = (s: CinemaStateDTO, serverNow: number, duration: number) =>
  Math.min(duration, Math.max(0, s.playing ? s.position + (serverNow - s.updatedAt) / 1000 : s.position));

type Control = { action: "select"; movieId: string } | { action: "play" | "pause" | "seek"; position: number } | { action: "stop" };

/** The library and the room's clock, kept current over the socket. */
function useCinema(channelId: string, onNotify: (message: string) => void) {
  const [data, setData] = useState<CinemaDTO | null>(null);
  const [failed, setFailed] = useState(false);
  /** Server clock minus ours, from the quickest round trip seen. */
  const offset = useRef(0);
  const bestTrip = useRef(Infinity);
  /** Set while the shown state is our own guess, before the server has confirmed it. */
  const guessed = useRef(false);

  const sample = (serverNow: number, sent: number) => {
    const back = Date.now();
    const trip = back - sent;
    if (trip > bestTrip.current * 2 && bestTrip.current !== Infinity) return;
    bestTrip.current = Math.min(bestTrip.current, trip);
    offset.current = serverNow - (sent + back) / 2;
  };
  const serverNow = useCallback(() => Date.now() + offset.current, []);

  /** Newer states win; a server state always replaces our own guess. */
  const accept = useCallback((state: CinemaStateDTO) => {
    setData((d) => {
      if (!d) return d;
      if (!guessed.current && state.updatedAt < d.state.updatedAt) return d;
      guessed.current = false;
      return { ...d, state };
    });
  }, []);

  const load = useCallback(() => {
    const sent = Date.now();
    api<CinemaDTO>(`/api/channels/${channelId}/cinema`)
      .then((d) => {
        sample(d.serverNow, sent);
        guessed.current = false;
        setData(d);
        setFailed(false);
      })
      .catch((err) => {
        setFailed(true);
        onNotify(err.message);
      });
  }, [channelId, onNotify]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onState = (e: { channelId: string; state: CinemaStateDTO }) => e.channelId === channelId && accept(e.state);
    // One library for the whole app, so every change to it applies here.
    const onLibrary = (e: { movies: MovieDTO[] }) => setData((d) => (d ? { ...d, movies: e.movies } : d));
    socket.on("cinema:state", onState);
    socket.on("cinema:library", onLibrary);
    // Changes made while the socket was down are picked up when it comes back.
    socket.on("connect", load);
    return () => {
      socket.off("cinema:state", onState);
      socket.off("cinema:library", onLibrary);
      socket.off("connect", load);
    };
  }, [channelId, load, accept]);

  const control = useCallback(
    async (body: Control, guess?: Partial<CinemaStateDTO>) => {
      if (guess) {
        guessed.current = true;
        setData((d) => (d ? { ...d, state: { ...d.state, ...guess, updatedAt: serverNow(), by: null } } : d));
      }
      const sent = Date.now();
      try {
        const res = await api<{ state: CinemaStateDTO; serverNow: number }>(`/api/channels/${channelId}/cinema`, { body });
        sample(res.serverNow, sent);
        accept(res.state);
      } catch (err) {
        onNotify((err as Error).message);
        load();
      }
    },
    [channelId, serverNow, accept, load, onNotify],
  );

  return { data, setData, failed, load, control, serverNow };
}

/** The cinema while connected: the film (or the library) on top, everyone in the room in a row under it. */
export function CinemaStage({
  channelId,
  participants,
  onNotify,
}: {
  channelId: string;
  participants: VoiceParticipant[];
  onNotify: (message: string) => void;
}) {
  const { data, failed, load, control, serverNow } = useCinema(channelId, onNotify);
  const [libraryOpen, setLibraryOpen] = useState(false);

  if (!data) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        {failed ? (
          <button onClick={load} className="btn-primary px-5">
            تلاش دوباره
          </button>
        ) : (
          <Loader2 className="size-6 animate-spin text-muted" />
        )}
      </div>
    );
  }

  const movie = data.movies.find((m) => m.id === data.state.movieId) ?? null;
  const pick = (m: MovieDTO) => {
    setLibraryOpen(false);
    void control({ action: "select", movieId: m.id }, { movieId: m.id, playing: false, position: 0 });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-2 sm:p-4">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {movie ? (
          <Player
            key={movie.id}
            movie={movie}
            state={data.state}
            serverNow={serverNow}
            control={control}
            onLibrary={() => setLibraryOpen(true)}
          />
        ) : (
          <LibraryPanel data={data} onPick={pick} />
        )}
        {movie && libraryOpen && (
          <div className="absolute inset-0 z-20 flex flex-col rounded-3xl bg-ink-900">
            <LibraryPanel
              data={data}
              onPick={pick}
              onClose={() => setLibraryOpen(false)}
              onStop={() => {
                setLibraryOpen(false);
                void control({ action: "stop" }, { movieId: null, playing: false, position: 0 });
              }}
            />
          </div>
        )}
      </div>
      <PeopleRow known={participants} />
    </div>
  );
}

/** Everyone in the call, as a row of chips that light up while they talk. */
export function PeopleRow({ known }: { known: VoiceParticipant[] }) {
  const people = useParticipants();
  const byId = new Map(known.map((p) => [p.id, p]));
  return (
    <ul className="scrollbar-thin flex shrink-0 gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible">
      {people.map((p) => (
        <li
          key={p.identity}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-full bg-ink-800 py-1 ps-1 pe-3 text-xs ring-2 transition",
            p.isSpeaking ? "ring-accent" : "ring-transparent",
          )}
        >
          <Avatar
            user={{ name: p.name || "?", color: byId.get(p.identity)?.color ?? "#6c5ce7", avatar: byId.get(p.identity)?.avatar }}
            size="sm"
            speaking={p.isSpeaking}
          />
          <span className="max-w-24 truncate">{p.isLocal ? "شما" : p.name}</span>
          {!p.isMicrophoneEnabled && <MicOff className="size-3 shrink-0 text-danger" />}
        </li>
      ))}
    </ul>
  );
}

function LibraryPanel({
  data,
  onPick,
  onClose,
  onStop,
}: {
  data: CinemaDTO;
  onPick: (m: MovieDTO) => void;
  onClose?: () => void;
  onStop?: () => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-3xl bg-ink-900/80 p-3 ring-1 ring-line sm:p-4" aria-label="کتابخانهٔ فیلم">
      <header className="flex items-center gap-2">
        <Library className="size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 leading-5">
          <h2 className="font-bold">کتابخانهٔ فیلم</h2>
          <p className="truncate text-xs text-muted">
            {data.movies.length ? `${toPersianDigits(data.movies.length)} فیلم · فیلمی را برای پخش برای همه انتخاب کنید` : "هنوز فیلمی اضافه نشده است"}
          </p>
        </div>
        {data.canManage && (
          <Link
            href="/admin?tab=films"
            target="_blank"
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted transition hover:bg-ink-800 hover:text-fg"
          >
            <Settings2 className="size-3.5" />
            مدیریت فیلم‌ها
          </Link>
        )}
        {onStop && (
          <button
            onClick={onStop}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted transition hover:bg-ink-800 hover:text-danger"
          >
            <Square className="size-3.5" />
            پایان پخش
          </button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="بستن" title="بستن" className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-ink-800 hover:text-fg">
            <X className="size-5" />
          </button>
        )}
      </header>

      {data.movies.length ? (
        <ul className="scrollbar-thin -mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
          {data.movies.map((m) => {
            const current = m.id === data.state.movieId;
            return (
              <li key={m.id} className={cn("group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-ink-800", current && "bg-ink-800 ring-1 ring-accent/40")}>
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink-700 text-accent">
                  <Film className="size-5" />
                </span>
                <div className="min-w-0 flex-1 leading-5">
                  <p className="truncate text-sm font-semibold">
                    <bdi>{m.name}</bdi>
                  </p>
                  <p className="truncate text-xs text-muted">{filmClock(m.duration)}</p>
                </div>
                <button
                  onClick={() => onPick(m)}
                  disabled={current}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-strong px-3.5 py-2 text-xs font-semibold text-on-accent transition hover:bg-accent active:scale-95 disabled:opacity-50"
                >
                  <Play className="size-3.5" />
                  {current ? "در حال پخش" : "پخش"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-sm">
            <Clapperboard className="mx-auto size-12 text-accent" />
            <p className="mt-4 text-sm leading-7 text-muted">
              {data.canManage
                ? "کتابخانه خالی است. از بخش «فیلم‌ها» در پنل مدیریت، فیلم آپلود کنید یا لینکش را بدهید تا سرور دانلودش کند."
                : "هنوز فیلمی در کتابخانه نیست. فیلم‌ها را مدیر صدامون اضافه می‌کند."}
            </p>
            {data.canManage && (
              <Link href="/admin?tab=films" target="_blank" className="btn-primary mt-4 inline-flex px-5 text-sm">
                <Settings2 className="size-4" />
                رفتن به پنل مدیریت
              </Link>
            )}
          </div>
        </div>
      )}
      <p className="text-xs leading-5 text-muted">صدای فیلم از دستگاه هر کس پخش می‌شود. برای اینکه صدای فیلم در تماس نپیچد، هدفون بزنید.</p>
    </section>
  );
}

/** The subtitle this viewer wants for a film: what they last picked, or else the Persian one. */
function preferredSubtitle(tracks: SubtitleDTO[]) {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SUBTITLE_KEY);
  } catch {}
  if (saved === "off") return null;
  return tracks.find((t) => t.lang === saved) ?? defaultSubtitle(tracks);
}

/**
 * The lines on screen now. The browser loads the track and keeps its time (a hidden <track> reports which cues are
 * active); we draw them, so Persian reads right to left and the text stays clear of our controls.
 */
function useSubtitle(video: React.RefObject<HTMLVideoElement | null>, id: string | null) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const el = v.querySelector("track");
    const ours = el?.track ?? null;
    // Safari can turn on the film's own embedded track, which would show every line twice.
    const quiet = () => {
      for (const t of Array.from(v.textTracks)) if (t !== ours && t.mode !== "disabled") t.mode = "disabled";
    };
    const update = () =>
      setLines(Array.from(ours?.activeCues ?? []).map((c) => (c as VTTCue).getCueAsHTML().textContent ?? ""));
    // An iPhone's own full-screen player shows only the video, so there the browser has to draw the subtitle.
    const native = () => ours && (ours.mode = "showing");
    const back = () => ours && (ours.mode = "hidden");

    quiet();
    back();
    v.textTracks.addEventListener("addtrack", quiet);
    v.textTracks.addEventListener("change", quiet);
    v.addEventListener("webkitbeginfullscreen", native);
    v.addEventListener("webkitendfullscreen", back);
    ours?.addEventListener("cuechange", update);
    el?.addEventListener("load", update);
    return () => {
      v.textTracks.removeEventListener("addtrack", quiet);
      v.textTracks.removeEventListener("change", quiet);
      v.removeEventListener("webkitbeginfullscreen", native);
      v.removeEventListener("webkitendfullscreen", back);
      ours?.removeEventListener("cuechange", update);
      el?.removeEventListener("load", update);
      setLines([]);
    };
  }, [video, id]);
  return lines;
}

/**
 * The film, with our own controls instead of the browser's: a click here is sent to the room and the video then
 * follows the room's clock, so there is no telling apart our own events from the ones we caused by following.
 */
function Player({
  movie,
  state,
  serverNow,
  control,
  onLibrary,
}: {
  movie: MovieDTO;
  state: CinemaStateDTO;
  serverNow: () => number;
  control: (body: Control, guess?: Partial<CinemaStateDTO>) => Promise<void>;
  onLibrary: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(1, Math.max(0, v)) : 1;
    } catch {
      return 1;
    }
  });
  const [muted, setMuted] = useState(false);
  const [full, setFull] = useState(false);
  const [chrome, setChrome] = useState(true);
  const idle = useRef<number | undefined>(undefined);
  /** How the last press came in: a tap on a phone only brings up the controls, a mouse click plays or pauses. */
  const pointer = useRef("mouse");

  /** The subtitle picked during this film: an id, null for none, undefined until something is picked. */
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [subsOpen, setSubsOpen] = useState(false);
  const subtitles = movie.subtitles;
  const subtitle = picked === undefined ? preferredSubtitle(subtitles) : (subtitles.find((s) => s.id === picked) ?? null);
  const lines = useSubtitle(video, subtitle?.id ?? null);
  const labels = subtitleLabels(subtitles);
  const pickSubtitle = (s: SubtitleDTO | null) => {
    setPicked(s?.id ?? null);
    setSubsOpen(false);
    try {
      localStorage.setItem(SUBTITLE_KEY, s?.lang ?? "off");
    } catch {}
  };

  const expected = useCallback(() => expectedAt(state, serverNow(), movie.duration), [state, serverNow, movie.duration]);
  const ended = state.playing ? time >= movie.duration - 0.25 : state.position >= movie.duration - 0.5;

  /** Lines our copy up with the room. `tight` after a change; loose for the periodic check, so small jitter is left alone. */
  const follow = useCallback(
    (tight: boolean) => {
      const v = video.current;
      if (!v || v.readyState < 1) return;
      const target = expected();
      if (Math.abs(v.currentTime - target) > (tight ? SNAP : DRIFT)) v.currentTime = target;
      const shouldPlay = state.playing && target < movie.duration;
      if (shouldPlay && v.paused) v.play().then(() => setBlocked(false), () => setBlocked(true));
      else if (!shouldPlay && !v.paused) v.pause();
    },
    [expected, state.playing, movie.duration],
  );

  useEffect(() => follow(true), [follow]);
  useEffect(() => {
    if (!state.playing) return;
    const timer = window.setInterval(() => {
      const v = video.current;
      // While it is still loading, jumping around only makes it load more.
      if (v && v.readyState >= 3) follow(false);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [state.playing, follow]);

  useEffect(() => {
    if (video.current) {
      video.current.volume = volume;
      video.current.muted = muted;
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {}
  }, [volume, muted]);

  useEffect(() => {
    const onChange = () => setFull(!!(document.fullscreenElement ?? (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // The controls fade out while the film plays and nobody moves the mouse; any movement or tap brings them back.
  const wake = () => {
    setChrome(true);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setChrome(false), 3000);
  };
  useEffect(() => () => window.clearTimeout(idle.current), []);
  const showChrome = chrome || !state.playing || scrub !== null || blocked || subsOpen;

  const current = () => video.current?.currentTime ?? expected();
  const togglePlay = () => {
    const v = video.current;
    // Starting playback inside the click keeps browsers that block autoplay happy.
    if (!state.playing || ended) {
      const from = ended ? 0 : current();
      v?.play().catch(() => {});
      void control({ action: "play", position: from }, { playing: true, position: from });
    } else {
      v?.pause();
      const at = current();
      void control({ action: "pause", position: at }, { playing: false, position: at });
    }
  };
  const seek = (to: number) => {
    const at = Math.min(movie.duration, Math.max(0, to));
    if (video.current) video.current.currentTime = at;
    setTime(at);
    void control({ action: "seek", position: at }, { position: at });
  };
  const commitScrub = () => {
    if (scrub === null) return;
    seek(scrub);
    setScrub(null);
  };

  const toggleFull = () => {
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    if (d.webkitFullscreenElement) return void d.webkitExitFullscreen?.();
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (el?.requestFullscreen) return void el.requestFullscreen().catch(() => {});
    if (el?.webkitRequestFullscreen) return void el.webkitRequestFullscreen();
    // iPhones only let a lone video go full screen.
    (video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
  };

  const shown = scrub ?? time;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label={`پخش ${movie.name}`}>
      <header className="flex items-center gap-2 px-1">
        <Clapperboard className="size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 leading-5">
          <p className="truncate text-sm font-semibold">
            <bdi>{movie.name}</bdi>
          </p>
          <p className="truncate text-xs text-muted">
            {filmClock(movie.duration)}
            {state.by && ` · ${state.by} ${state.playing ? "پخش کرد" : "نگه داشت"}`}
          </p>
        </div>
        <button
          onClick={onLibrary}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink-800 px-3 py-2 text-xs font-semibold transition hover:bg-ink-700"
        >
          <Library className="size-4" />
          کتابخانه
        </button>
      </header>

      <div
        ref={box}
        dir="ltr"
        onPointerMove={wake}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
          wake();
        }}
        className={cn("relative isolate flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black", !showChrome && "cursor-none")}
      >
        <video
          ref={video}
          src={movie.url}
          playsInline
          preload="auto"
          className="size-full object-contain"
          onClick={() => pointer.current === "mouse" && togglePlay()}
          onDoubleClick={() => pointer.current === "mouse" && toggleFull()}
          onLoadedMetadata={() => {
            setProblem(null);
            follow(true);
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onError={() => setProblem("این فیلم در مرورگر شما پخش نمی‌شود. فیلم را با MP4 (H.264 و AAC) دوباره اضافه کنید")}
        >
          {subtitle && <track key={subtitle.id} kind="subtitles" src={subtitle.url} srcLang={subtitle.lang} label={labels[subtitles.indexOf(subtitle)]} />}
        </video>

        {!!lines.length && (
          <div
            className={cn(
              "@container pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1 px-4 text-center transition-[bottom] duration-300",
              showChrome ? "bottom-24" : "bottom-[4%]",
            )}
          >
            {lines.map((line, i) => (
              <p
                key={i}
                dir={/[\u0590-\u08ff]/.test(line) ? "rtl" : "ltr"}
                className="max-w-[90cqw] text-[clamp(1rem,3cqw,2.75rem)] leading-[1.75] font-semibold whitespace-pre-line text-white [text-shadow:0_1px_3px_#000]"
              >
                <span className="rounded-md bg-black/60 box-decoration-clone px-[0.4em] py-[0.15em]">{line}</span>
              </p>
            ))}
          </div>
        )}

        {waiting && state.playing && !problem && (
          <Loader2 className="pointer-events-none absolute size-10 animate-spin text-white/80" />
        )}

        {(problem || ended) && (
          <div dir="rtl" className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center text-sm leading-7 text-white">
            {problem ?? (
              <button onClick={togglePlay} className="flex items-center gap-2 rounded-full bg-accent-strong px-5 py-3 font-semibold text-on-accent">
                <Play className="size-5" />
                پخش دوباره از اول
              </button>
            )}
          </div>
        )}

        {blocked && state.playing && !problem && (
          <button
            dir="rtl"
            onClick={() => video.current?.play().then(() => setBlocked(false), () => {})}
            className="absolute inset-0 z-10 grid place-items-center bg-black/60 text-white"
          >
            <span className="flex items-center gap-2 rounded-full bg-accent-strong px-5 py-3 font-semibold text-on-accent shadow-xl">
              <Play className="size-5" />
              برای همراه شدن با پخش بزنید
            </span>
          </button>
        )}

        {subsOpen && (
          <>
            <button tabIndex={-1} aria-label="بستن" onClick={() => setSubsOpen(false)} className="absolute inset-0 z-20 cursor-default" />
            <ul
              dir="rtl"
              aria-label="زیرنویس"
              className="scrollbar-thin absolute right-3 bottom-16 z-30 max-h-[60%] min-w-44 max-w-[80%] overflow-y-auto rounded-2xl bg-ink-800 p-1.5 text-sm text-fg shadow-xl ring-1 ring-line"
            >
              {[null, ...subtitles].map((s, i) => {
                const on = s?.id === subtitle?.id;
                return (
                  <li key={s?.id ?? "off"}>
                    <button
                      aria-pressed={on}
                      onClick={() => pickSubtitle(s)}
                      className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start transition hover:bg-ink-700", on && "text-accent")}
                    >
                      <span className="min-w-0 flex-1 truncate">{s ? labels[i - 1] : "بدون زیرنویس"}</span>
                      {on && <Check className="size-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* A gradient rather than a blur: a backdrop-filter over a playing video makes Safari and Chrome drop the video layer. */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-300 will-change-[opacity]",
            showChrome ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <input
            type="range"
            min={0}
            max={movie.duration}
            step={0.1}
            value={Math.min(shown, movie.duration)}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            aria-label="جای پخش"
            className="h-4 w-full cursor-pointer accent-[var(--color-accent)]"
            style={{ background: "transparent" }}
          />
          <div className="flex items-center gap-1">
            <PlayerButton label={state.playing ? "توقف برای همه" : "پخش برای همه"} onClick={togglePlay}>
              {state.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </PlayerButton>
            <span className="px-1 text-xs tabular-nums text-white/85">
              {filmClock(shown)} / {filmClock(movie.duration)}
            </span>
            <span className="ms-auto flex items-center gap-1">
              {!!subtitles.length && (
                <PlayerButton
                  label={subtitles.length > 1 ? "زیرنویس (فقط برای شما)" : subtitle ? "خاموش کردن زیرنویس (فقط برای شما)" : "روشن کردن زیرنویس (فقط برای شما)"}
                  onClick={() => (subtitles.length > 1 ? setSubsOpen(!subsOpen) : pickSubtitle(subtitle ? null : subtitles[0]))}
                >
                  {subtitle ? <Captions className="size-5" /> : <CaptionsOff className="size-5" />}
                </PlayerButton>
              )}
              <PlayerButton label={muted ? "صدادار کردن فیلم" : "بی‌صدا کردن فیلم (فقط برای شما)"} onClick={() => setMuted(!muted)}>
                <VolumeIcon className="size-5" />
              </PlayerButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  setMuted(false);
                }}
                aria-label="بلندی صدای فیلم (فقط برای شما)"
                className="hidden w-24 accent-[var(--color-accent)] sm:block"
              />
              <PlayerButton label={full ? "خروج از تمام‌صفحه" : "تمام‌صفحه"} onClick={toggleFull}>
                {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </PlayerButton>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="grid size-9 shrink-0 place-items-center rounded-full transition hover:bg-white/15 active:scale-95"
    >
      {children}
    </button>
  );
}
