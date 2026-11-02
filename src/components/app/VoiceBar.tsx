"use client";

import { Mic, MicOff, PhoneOff, Signal } from "lucide-react";
import { cn } from "@/lib/format";
import type { VoiceConnection, VoiceSettings } from "./App";
import { ControlButton, useVoiceToggles } from "./VoiceControls";

/** Phones only: keeps the active voice call visible (and mutable) while browsing text channels. */
export default function VoiceBar({
  connection,
  settings,
  onOpen,
  onLeave,
}: {
  connection: VoiceConnection;
  settings: VoiceSettings;
  onOpen: () => void;
  onLeave: () => void;
}) {
  const { isMicrophoneEnabled, error, toggleMic } = useVoiceToggles(settings);

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/5 bg-accent-strong/10 px-3 py-1.5 select-none md:hidden">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-start">
        <Signal className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 text-xs leading-5">
          <span className={cn("block font-semibold", error ? "text-danger" : "text-accent")}>
            {error ?? "متصل به صدا"}
          </span>
          <span className="block truncate text-muted">
            {connection.channelName} / {connection.serverName}
          </span>
        </span>
      </button>
      <ControlButton
        className="size-9"
        label={isMicrophoneEnabled ? "بستن میکروفون" : "باز کردن میکروفون"}
        off={!isMicrophoneEnabled}
        onClick={toggleMic}
      >
        {isMicrophoneEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </ControlButton>
      <ControlButton className="size-9 bg-danger/90 text-white hover:bg-danger" label="قطع اتصال" onClick={onLeave}>
        <PhoneOff className="size-4" />
      </ControlButton>
    </div>
  );
}
