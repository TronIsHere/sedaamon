"use client";

import { GridLayout, ParticipantTile, useParticipants, useTracks } from "@livekit/components-react";
import { Track, type RemoteParticipant } from "livekit-client";
import { useEffect, useState } from "react";
import { Loader2, MicOff, Volume2, Volume1 } from "lucide-react";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
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
        <ConnectedStage participants={participants} />
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
function ConnectedStage({ participants }: { participants: VoiceParticipant[] }) {
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

  if (hasVideo) {
    return (
      <div data-lk-theme="default" className="relative min-h-0 flex-1 p-2 sm:p-4" dir="ltr">
        <GridLayout tracks={tracks} style={{ height: "100%" }}>
          <ParticipantTile />
        </GridLayout>
        <ShareVolume />
      </div>
    );
  }

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
