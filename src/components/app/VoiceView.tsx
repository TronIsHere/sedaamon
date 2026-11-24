"use client";

import {
  GridLayout,
  ParticipantTile,
  useIsMuted,
  useIsSpeaking,
  useMaybeTrackRefContext,
  useParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track, type RemoteParticipant } from "livekit-client";
import { createContext, useContext, useEffect, useState, type MouseEvent } from "react";
import {
  Clapperboard,
  Eye,
  EyeOff,
  Gauge,
  LayoutGrid,
  Loader2,
  Maximize,
  Maximize2,
  MicOff,
  Minimize,
  Minimize2,
  Pin,
  Volume1,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import { videoKey } from "@/lib/voice";
import type { ChannelDTO, VoiceParticipant } from "@/lib/types";
import type { VoiceConnection, VoiceSettings } from "./useVoice";
import Avatar from "./Avatar";
import { CinemaStage } from "./Cinema";
import VoiceControls from "./VoiceControls";

export default function VoiceView({
  channel,
  participants,
  connection,
  joining,
  settings,
  onJoin,
  onLeave,
  onNotify,
}: {
  channel: ChannelDTO;
  participants: VoiceParticipant[];
  connection: VoiceConnection | null;
  joining: boolean;
  settings: VoiceSettings;
  onJoin: () => void;
  onLeave: () => void;
  onNotify: (message: string) => void;
}) {
  const cinema = channel.type === "cinema";
  if (connection?.channelId === channel.id) {
    return (
      <div className="bg-glow relative flex min-h-0 flex-1 flex-col">
        {settings.lowData && !cinema && <LowDataNotice settings={settings} />}
        {cinema ? (
          <CinemaStage channelId={channel.id} participants={participants} onNotify={onNotify} />
        ) : (
          <ConnectedStage participants={participants} settings={settings} />
        )}
        <div className="flex shrink-0 justify-center px-3 pt-2 pb-safe-4 sm:pb-5">
          <div className="rounded-full bg-ink-800 p-2.5 shadow-2xl shadow-black/50">
            <VoiceControls settings={settings} onLeave={onLeave} cinema={cinema} />
          </div>
        </div>
      </div>
    );
  }
  const Icon = cinema ? Clapperboard : Volume2;

  return (
    <div className="bg-glow grid flex-1 place-items-center p-6 text-center">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-ink-800 p-8">
        <span className="relative mx-auto grid size-20 place-items-center rounded-full bg-accent-strong text-on-accent">
          <Icon className="size-9" />
          {participants.length > 0 && (
            <span className="absolute inset-0 animate-ping rounded-full bg-accent-strong/30 [animation-duration:2s]" />
          )}
        </span>
        <h2 className="mt-5 text-xl font-bold">{channel.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {participants.length
            ? `${toPersianDigits(participants.length)} نفر الان در کانال هستند`
            : "کسی در کانال نیست. اولین نفر باشید."}
        </p>
        {cinema && <p className="mt-2 text-xs leading-5 text-muted">فیلم‌های کتابخانهٔ این سینما را با هم و هم‌زمان تماشا کنید و حرف بزنید.</p>}
        {participants.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-4">
            {participants.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1.5">
                <Avatar user={p} />
                <span className="max-w-20 truncate text-xs text-muted">{p.name}</span>
              </div>
            ))}
          </div>
        )}
        {connection && (
          <p className="mt-5 text-xs text-muted">با پیوستن به این کانال، از «{connection.channelName}» خارج می‌شوید.</p>
        )}
        <button
          onClick={onJoin}
          disabled={joining}
          className="btn-primary mx-auto mt-6 w-full px-6"
        >
          {joining && <Loader2 className="size-4 animate-spin" />}
          {cinema ? "ورود به سینما" : "پیوستن به کانال"}
        </button>
      </div>
    </div>
  );
}

/** Video tiles when anyone shares a camera or screen; otherwise big avatar cards that glow while people talk. */
function ConnectedStage({ participants, settings }: { participants: VoiceParticipant[]; settings: VoiceSettings }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const people = useParticipants();
  const hasVideo = tracks.some((t) => t.publication && !t.publication.isMuted);
  const known = new Map(participants.map((p) => [p.id, p]));

  if (hasVideo) return <VideoStage tracks={tracks} known={known} settings={settings} />;

  return (
    <div className="scrollbar-thin grid min-h-0 flex-1 content-center overflow-y-auto p-4 sm:p-8">
      <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {people.map((p) => (
          <div
            key={p.identity}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl bg-ink-800 p-4 ring-2 transition",
              p.isSpeaking ? "ring-accent" : "ring-transparent",
            )}
          >
            <span className={cn("rounded-full transition", p.isSpeaking && "ring-4 ring-accent/40")}>
              <Avatar
                user={{ name: p.name || "?", color: known.get(p.identity)?.color ?? "#6c5ce7", avatar: known.get(p.identity)?.avatar }}
                size="lg"
                speaking={p.isSpeaking}
              />
            </span>
            <span className="flex max-w-full items-center gap-1.5 text-sm font-semibold">
              <span className="truncate">{p.name}</span>
              {!p.isMicrophoneEnabled && <MicOff className="size-3.5 shrink-0 text-danger" />}
            </span>
            {p.isLocal && <span className="-mt-2 text-xs text-muted">شما</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Says low-data mode is on and what it does, with a quick way out. */
function LowDataNotice({ settings }: { settings: VoiceSettings }) {
  return (
    <div className="flex shrink-0 justify-center px-3 pt-2 sm:pt-3">
      <p className="flex max-w-full items-center gap-2 rounded-full bg-ink-800/90 py-1 ps-3 pe-1 text-xs shadow-lg">
        <Gauge className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate">حالت کم‌مصرف: تصویرها فقط به انتخاب شما و با کیفیت کمتر می‌آیند</span>
        <button
          onClick={() => settings.setLowData(false)}
          className="shrink-0 rounded-full bg-ink-700 px-3 py-1 font-semibold transition hover:bg-ink-600"
        >
          خاموش
        </button>
      </p>
    </div>
  );
}

interface StageState {
  focusKey: string | null;
  /** Whether the person picked the big feed themselves (rather than a screen share taking the spot on its own). */
  pinned: boolean;
  setFocus: (key: string | null) => void;
  /** The big feed fills the stage, with the row of people hidden. */
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  known: Map<string, VoiceParticipant>;
  settings: VoiceSettings;
}

const StageContext = createContext<StageState | null>(null);

const keyOf = (t: TrackReferenceOrPlaceholder) => videoKey(t.participant.identity, t.source);
const isLive = (t: TrackReferenceOrPlaceholder) => !!t.publication && !t.publication.isMuted;

/**
 * Cameras and screens. A screen share goes on top, big, with everyone else in a row under it; it can be made
 * bigger (the row folds away) or full screen. Anyone can also pin a camera up there, or go back to the grid.
 */
function VideoStage({
  tracks,
  known,
  settings,
}: {
  tracks: TrackReferenceOrPlaceholder[];
  known: Map<string, VoiceParticipant>;
  settings: VoiceSettings;
}) {
  const [pinned, setPinned] = useState<string | null>(null);
  /** The screen share someone sent back to the grid, so it doesn't jump straight back to the big spot. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Someone else's screen first; your own only when nobody else shares, since it shows you what you already see.
  const shares = tracks.filter((t) => t.source === Track.Source.ScreenShare && keyOf(t) !== dismissed);
  const autoShare = shares.find((t) => !t.participant.isLocal) ?? shares[0];
  const focus = tracks.find((t) => keyOf(t) === pinned) ?? autoShare;
  const focusKey = focus ? keyOf(focus) : null;
  const others = focus ? tracks.filter((t) => t !== focus) : [];

  const setFocus = (key: string | null) => {
    if (key === null && focusKey && focusKey !== pinned) setDismissed(focusKey);
    if (key === null) setExpanded(false);
    setPinned(key);
  };

  return (
    <StageContext.Provider value={{ focusKey, pinned: !!pinned && pinned === focusKey, setFocus, expanded, setExpanded, known, settings }}>
      <div data-lk-theme="default" className="relative min-h-0 flex-1 p-2 sm:p-4" dir="ltr">
        {focus ? (
          <div className="flex size-full flex-col gap-2">
            <div data-stage-focus className="relative isolate min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
              <StageTile trackRef={focus} focused />
              {focus.source === Track.Source.ScreenShare && !focus.participant.isLocal && <ShareVolume />}
            </div>
            {others.length > 0 && !expanded && (
              <div className="scrollbar-thin flex h-24 shrink-0 justify-center-safe gap-2 overflow-x-auto sm:h-32">
                {others.map((t) => (
                  <div key={keyOf(t)} className="aspect-video h-full shrink-0">
                    <StageTile trackRef={t} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <GridLayout tracks={tracks} style={{ height: "100%" }}>
              <StageTile />
            </GridLayout>
            <ShareVolume />
          </>
        )}
      </div>
    </StageContext.Provider>
  );
}

/** One feed on the stage, with buttons to bring it up big, enlarge it, show it full screen, or (in low-data mode) let it through. */
function StageTile({ trackRef: given, focused = false }: { trackRef?: TrackReferenceOrPlaceholder; focused?: boolean }) {
  const fromContext = useMaybeTrackRefContext();
  const stage = useContext(StageContext)!;
  const trackRef = (given ?? fromContext)!;
  const key = keyOf(trackRef);
  const { lowData, allowedVideo, setVideoAllowed } = stage.settings;
  const live = isLive(trackRef);
  const remote = !trackRef.participant.isLocal;
  const paused = lowData && live && remote && !allowedVideo.has(key);

  return (
    <div
      className="group relative isolate size-full overflow-hidden rounded-lg"
      // A click on a small tile brings it up big; the big one ignores clicks so its buttons are easy to hit.
      onClick={focused ? undefined : () => stage.setFocus(key)}
    >
      {paused ? (
        <PausedTile trackRef={trackRef} large={focused} />
      ) : live ? (
        <ParticipantTile trackRef={trackRef} className="size-full" />
      ) : (
        <PersonTile trackRef={trackRef} large={focused} />
      )}
      {/*
        No backdrop-filter on these buttons: a blurred layer appearing over a playing video makes Safari (and Chrome
        on some GPUs) drop the video's layer, so the shared screen vanished whenever the mouse came near them.
        will-change keeps the bar on its own layer from the start instead of creating one on hover.
      */}
      <div
        dir="rtl"
        className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity will-change-[opacity] group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
      >
        {lowData && live && remote && allowedVideo.has(key) && (
          <TileButton label="قطع دوباره تصویر (کم‌مصرف)" onClick={() => setVideoAllowed(key, false)}>
            <EyeOff className="size-4" />
          </TileButton>
        )}
        {focused ? (
          <>
            <FullscreenButton />
            <TileButton
              label={stage.expanded ? "نمایش دوباره افراد" : "بزرگ‌تر کردن"}
              onClick={() => stage.setExpanded(!stage.expanded)}
            >
              {stage.expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </TileButton>
            <TileButton label="برگشت به نمای همه" onClick={() => stage.setFocus(null)}>
              <LayoutGrid className="size-4" />
            </TileButton>
          </>
        ) : (
          <TileButton label="نمایش بزرگ" onClick={() => stage.setFocus(key)}>
            <Pin className="size-4" />
          </TileButton>
        )}
      </div>
    </div>
  );
}

/** Someone with their camera off: their picture and name, glowing while they talk. */
function PersonTile({ trackRef, large }: { trackRef: TrackReferenceOrPlaceholder; large: boolean }) {
  const stage = useContext(StageContext)!;
  const speaking = useIsSpeaking(trackRef.participant);
  const micMuted = useIsMuted({ participant: trackRef.participant, source: Track.Source.Microphone });
  const person = stage.known.get(trackRef.participant.identity);
  const name = trackRef.participant.name || person?.name || "?";

  return (
    <div
      dir="rtl"
      className={cn(
        "@container flex size-full flex-col items-center justify-center gap-1.5 rounded-lg bg-ink-800 p-2 text-center ring-2 ring-inset transition",
        speaking ? "ring-accent" : "ring-transparent",
      )}
    >
      <Avatar user={{ name, color: person?.color ?? "#6c5ce7", avatar: person?.avatar }} size={large ? "lg" : "md"} speaking={speaking} />
      <p className="hidden max-w-full items-center gap-1 text-xs @min-[7rem]:flex">
        <span className="truncate">{trackRef.participant.isLocal ? "شما" : name}</span>
        {micMuted && <MicOff className="size-3 shrink-0 text-danger" />}
      </p>
    </div>
  );
}

/** Stands in for a camera or screen held back by low-data mode; the voice still comes through. */
function PausedTile({ trackRef, large }: { trackRef: TrackReferenceOrPlaceholder; large: boolean }) {
  const stage = useContext(StageContext)!;
  const speaking = useIsSpeaking(trackRef.participant);
  const person = stage.known.get(trackRef.participant.identity);
  const name = trackRef.participant.name || person?.name || "?";
  const isScreen = trackRef.source === Track.Source.ScreenShare;

  return (
    <div
      dir="rtl"
      className={cn(
        "@container flex size-full flex-col items-center justify-center gap-2 rounded-lg bg-ink-800 p-2 text-center ring-2 ring-inset transition",
        speaking && !isScreen ? "ring-accent" : "ring-transparent",
      )}
    >
      <Avatar
        user={{ name, color: person?.color ?? "#6c5ce7", avatar: person?.avatar }}
        size={large ? "lg" : "md"}
        speaking={speaking}
      />
      <p className="hidden max-w-full truncate text-xs text-muted @min-[11rem]:block">
        {isScreen ? `اشتراک صفحهٔ ${name}` : `دوربین ${name}`} برای کم‌مصرفی دریافت نمی‌شود
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          stage.settings.setVideoAllowed(keyOf(trackRef), true);
        }}
        className="flex items-center gap-1.5 rounded-full bg-accent-strong px-3 py-1 text-xs font-semibold text-on-accent transition active:scale-95"
      >
        <Eye className="size-3.5" />
        نمایش
      </button>
    </div>
  );
}

type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
const fullscreenElement = () => document.fullscreenElement ?? (document as FullscreenDoc).webkitFullscreenElement ?? null;

/**
 * Fills the screen with the big feed's box (buttons included). Older Safari only knows the webkit-prefixed call,
 * and iPhones only let a lone video element go full screen, so the video itself takes over there.
 */
function FullscreenButton() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(!!fullscreenElement());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const doc = document as FullscreenDoc;
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    if (doc.webkitFullscreenElement) return void doc.webkitExitFullscreen?.();
    const box = e.currentTarget.closest<HTMLElement & { webkitRequestFullscreen?: () => void }>("[data-stage-focus]");
    if (box?.requestFullscreen) return void box.requestFullscreen().catch(() => {});
    if (box?.webkitRequestFullscreen) return void box.webkitRequestFullscreen();
    const video = box?.querySelector("video") as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    video?.webkitEnterFullscreen?.();
  };

  return (
    <TileButton label={full ? "خروج از تمام‌صفحه" : "تمام‌صفحه"} onClick={toggle}>
      {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
    </TileButton>
  );
}

function TileButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="grid size-8 place-items-center rounded-md bg-black/70 text-white transition hover:bg-black/90 active:scale-95"
    >
      {children}
    </button>
  );
}

/** Lets you turn someone's shared-screen sound up or down without touching their voice or anyone else's. */
function ShareVolume() {
  const sound = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: true }).filter((t) => !t.participant.isLocal);
  const [volume, setVolume] = useState(1);
  // A new sharer should start at the level already chosen, not at full volume.
  const sharers = sound.map((t) => t.participant.identity).join(",");

  useEffect(() => {
    for (const t of sound) (t.participant as RemoteParticipant).setVolume(volume, Track.Source.ScreenShareAudio);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sharers` stands for the list of participants
  }, [volume, sharers]);

  if (!sound.length) return null;
  const Icon = volume === 0 ? MicOff : volume < 0.5 ? Volume1 : Volume2;
  // Top left, away from the tile's buttons on the right. A solid background for the same reason as TileButton.
  return (
    <label dir="rtl" className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-md bg-black/70 px-2.5 py-1.5 text-xs text-white">
      <Icon className="size-4 shrink-0" />
      <span className="sr-only sm:not-sr-only">صدای اشتراک</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-24 accent-[var(--color-accent)]"
        aria-label="میزان صدای اشتراک صفحه"
      />
    </label>
  );
}
