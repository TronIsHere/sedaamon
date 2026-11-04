"use client";

import {
  GridLayout,
  ParticipantTile,
  useIsSpeaking,
  useMaybeTrackRefContext,
  useParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track, type RemoteParticipant } from "livekit-client";
import { createContext, useContext, useEffect, useState, type MouseEvent } from "react";
import { Eye, EyeOff, Gauge, Loader2, Maximize, MicOff, Minimize, Pin, PinOff, Volume2, Volume1 } from "lucide-react";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import { videoKey } from "@/lib/voice";
import type { ChannelDTO, VoiceParticipant } from "@/lib/types";
import type { VoiceConnection, VoiceSettings } from "./App";
import Avatar from "./Avatar";
import VoiceControls from "./VoiceControls";
import { useWatch, WatchPanel } from "./WatchTogether";

export default function VoiceView({
  channel,
  participants,
  connection,
  joining,
  settings,
  onJoin,
  onLeave,
}: {
  channel: ChannelDTO;
  participants: VoiceParticipant[];
  connection: VoiceConnection | null;
  joining: boolean;
  settings: VoiceSettings;
  onJoin: () => void;
  onLeave: () => void;
}) {
  if (connection?.channelId === channel.id) {
    return (
      <div className="bg-glow relative flex min-h-0 flex-1 flex-col">
        {settings.lowData && <LowDataNotice settings={settings} />}
        <ConnectedStage participants={participants} settings={settings} />
        <div className="flex shrink-0 justify-center px-3 pt-2 pb-safe-4 sm:pb-5">
          <div className="rounded-full bg-ink-800 p-2.5 shadow-2xl shadow-black/50">
            <VoiceControls settings={settings} onLeave={onLeave} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-glow grid flex-1 place-items-center p-6 text-center">
      <div className="w-full max-w-sm rounded-[1.75rem] bg-ink-800 p-8">
        <span className="relative mx-auto grid size-20 place-items-center rounded-full bg-accent-strong text-on-accent">
          <Volume2 className="size-9" />
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
          پیوستن به کانال
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
  const watch = useWatch();
  const hasVideo = tracks.some((t) => t.publication && !t.publication.isMuted);
  const known = new Map(participants.map((p) => [p.id, p]));

  // A film being watched together takes the stage; everyone else shrinks to a row of chips under it.
  if (watch.session) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-2 sm:p-4">
        <WatchPanel />
        <ul className="flex shrink-0 flex-wrap justify-center gap-2">
          {people.map((p) => (
            <li
              key={p.identity}
              className={cn(
                "flex items-center gap-2 rounded-full bg-ink-900/80 py-1 ps-1 pe-3 text-xs ring-1",
                p.isSpeaking ? "ring-2 ring-accent" : "ring-line",
              )}
            >
              <Avatar
                user={{ name: p.name || "?", color: known.get(p.identity)?.color ?? "#6c5ce7", avatar: known.get(p.identity)?.avatar }}
                size="sm"
              />
              <span className="max-w-24 truncate">{p.isLocal ? "شما" : p.name}</span>
              {!p.isMicrophoneEnabled && <MicOff className="size-3 shrink-0 text-danger" />}
            </li>
          ))}
        </ul>
      </div>
    );
  }

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
  setFocus: (key: string | null) => void;
  known: Map<string, VoiceParticipant>;
  settings: VoiceSettings;
}

const StageContext = createContext<StageState | null>(null);

const keyOf = (t: TrackReferenceOrPlaceholder) => videoKey(t.participant.identity, t.source);

/**
 * Cameras and screens. Anyone can pin a feed to see it big with the rest in a strip beside it; someone else's
 * screen share takes the big spot by itself until the person picks something else or goes back to the grid.
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

  const autoShare = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && !t.participant.isLocal && keyOf(t) !== dismissed,
  );
  const focus = tracks.find((t) => keyOf(t) === pinned) ?? autoShare;
  const focusKey = focus ? keyOf(focus) : null;
  const others = focus ? tracks.filter((t) => t !== focus) : [];

  const setFocus = (key: string | null) => {
    if (key === null && focusKey && focusKey !== pinned) setDismissed(focusKey);
    setPinned(key);
  };

  return (
    <StageContext.Provider value={{ focusKey, setFocus, known, settings }}>
      <div data-lk-theme="default" className="relative min-h-0 flex-1 p-2 sm:p-4" dir="ltr">
        {focus ? (
          <div className="flex size-full flex-col gap-2 lg:flex-row">
            <div data-stage-focus className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
              <StageTile trackRef={focus} focused />
            </div>
            {others.length > 0 && (
              <div className="scrollbar-thin flex h-24 shrink-0 gap-2 overflow-x-auto sm:h-28 lg:h-auto lg:w-52 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
                {others.map((t) => (
                  <div key={keyOf(t)} className="aspect-video h-full shrink-0 lg:h-auto lg:w-full">
                    <StageTile trackRef={t} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <GridLayout tracks={tracks} style={{ height: "100%" }}>
            <StageTile />
          </GridLayout>
        )}
        <ShareVolume />
      </div>
    </StageContext.Provider>
  );
}

/** One feed on the stage, with buttons to pin it, show it full screen, or (in low-data mode) let it through. */
function StageTile({ trackRef: given, focused = false }: { trackRef?: TrackReferenceOrPlaceholder; focused?: boolean }) {
  const fromContext = useMaybeTrackRefContext();
  const stage = useContext(StageContext)!;
  const trackRef = (given ?? fromContext)!;
  const key = keyOf(trackRef);
  const { lowData, allowedVideo, setVideoAllowed } = stage.settings;
  const live = !!trackRef.publication && !trackRef.publication.isMuted;
  const remote = !trackRef.participant.isLocal;
  const paused = lowData && live && remote && !allowedVideo.has(key);
  const pinned = stage.focusKey === key;

  return (
    <div
      className="group relative size-full"
      // A click on a small tile brings it up big; the big one stays put so its buttons are easy to hit.
      onClick={focused ? undefined : () => stage.setFocus(key)}
      onDoubleClick={focused ? () => stage.setFocus(null) : undefined}
    >
      {paused ? <PausedTile trackRef={trackRef} large={focused} /> : <ParticipantTile trackRef={trackRef} className="size-full" />}
      <div
        dir="rtl"
        className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
      >
        {lowData && live && remote && allowedVideo.has(key) && (
          <TileButton label="قطع دوباره تصویر (کم‌مصرف)" onClick={() => setVideoAllowed(key, false)}>
            <EyeOff className="size-4" />
          </TileButton>
        )}
        {focused && <FullscreenButton />}
        <TileButton label={pinned ? "برگشت به نمای همه" : "سنجاق و بزرگ کردن"} onClick={() => stage.setFocus(pinned ? null : key)}>
          {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </TileButton>
      </div>
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
        "@container flex size-full flex-col items-center justify-center gap-2 rounded-lg bg-ink-800 p-2 text-center ring-2 transition",
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

/**
 * Fills the screen with the big feed. iPhones only allow a lone video element to go full screen, so the
 * video itself takes over there.
 */
function FullscreenButton() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    const box = e.currentTarget.closest<HTMLElement>("[data-stage-focus]");
    if (box?.requestFullscreen) return void box.requestFullscreen().catch(() => {});
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
      className="grid size-8 place-items-center rounded-md bg-black/60 text-white backdrop-blur transition hover:bg-black/80 active:scale-95"
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
  return (
    <label
      dir="rtl"
      className="absolute end-5 top-5 z-10 flex items-center gap-2 rounded-full bg-ink-800/90 px-3 py-2 text-xs shadow-xl backdrop-blur"
    >
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
