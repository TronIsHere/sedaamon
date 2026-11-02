"use client";

import { useState } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { Gauge, HeadphoneOff, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/format";
import { canShareScreenAudio, micErrorMessage } from "@/lib/voice";
import type { VoiceSettings } from "./App";

/** Mic and deafen toggles plus error reporting, shared by the full controls and the mobile voice bar. */
export function useVoiceToggles(settings: VoiceSettings) {
  const local = useLocalParticipant();
  const { localParticipant, isMicrophoneEnabled } = local;
  const room = useRoomContext();
  const [error, setError] = useState<string>();
  // Every tap is a chance to unblock sound the browser held back (Safari), as long as it happens before an await.
  const unlockAudio = () => room.startAudio().catch(() => {});

  const attempt = async (
    action: () => Promise<unknown>,
    message: string | ((err: unknown) => string),
    ignoreCancel = false,
  ) => {
    setError(undefined);
    try {
      await action();
    } catch (err) {
      console.error(err);
      // Closing the browser's screen picker throws NotAllowedError; that's not worth an error message.
      if (!(ignoreCancel && (err as Error).name === "NotAllowedError"))
        setError(typeof message === "function" ? message(err) : message);
    }
  };

  const toggleMic = () =>
    attempt(async () => {
      unlockAudio();
      if (settings.deafened && !isMicrophoneEnabled) settings.setDeafened(false);
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    }, micErrorMessage);

  const toggleDeafen = () =>
    attempt(async () => {
      const next = !settings.deafened;
      if (!next) unlockAudio();
      settings.setDeafened(next);
      await localParticipant.setMicrophoneEnabled(!next);
    }, micErrorMessage);

  return { ...local, error, attempt, toggleMic, toggleDeafen };
}

/** Mic, deafen, camera, screen share, low-data and leave buttons for the active voice connection. */
export default function VoiceControls({
  settings,
  onLeave,
  compact = false,
}: {
  settings: VoiceSettings;
  onLeave: () => void;
  compact?: boolean;
}) {
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    error,
    attempt,
    toggleMic,
    toggleDeafen,
  } = useVoiceToggles(settings);
  const canShareScreen = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  const size = compact ? "size-9" : "size-12 sm:size-11";
  const icon = compact ? "size-4" : "size-5";

  return (
    <div className="space-y-1">
      <div className={cn("flex items-center", compact ? "gap-2" : "flex-wrap justify-center gap-1.5 sm:gap-2")}>
        <ControlButton
          className={size}
          label={isMicrophoneEnabled ? "بستن میکروفون" : "باز کردن میکروفون"}
          off={!isMicrophoneEnabled}
          onClick={toggleMic}
        >
          {isMicrophoneEnabled ? <Mic className={icon} /> : <MicOff className={icon} />}
        </ControlButton>
        <ControlButton
          className={size}
          label={settings.deafened ? "وصل کردن صدا" : "قطع صدای دیگران"}
          off={settings.deafened}
          onClick={toggleDeafen}
        >
          {settings.deafened ? <HeadphoneOff className={icon} /> : <Headphones className={icon} />}
        </ControlButton>
        {!compact && (
          <>
            <ControlButton
              className={size}
              label={isCameraEnabled ? "خاموش کردن دوربین" : "روشن کردن دوربین"}
              active={isCameraEnabled}
              onClick={() =>
                attempt(() => localParticipant.setCameraEnabled(!isCameraEnabled), "دسترسی به دوربین ممکن نشد")
              }
            >
              {isCameraEnabled ? <Video className={icon} /> : <VideoOff className={icon} />}
            </ControlButton>
            {canShareScreen && (
              <ControlButton
                className={size}
                label={isScreenShareEnabled ? "توقف اشتراک صفحه" : "اشتراک صفحه"}
                active={isScreenShareEnabled}
                onClick={() =>
                  attempt(
                    () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: canShareScreenAudio() }),
                    "اشتراک صفحه ممکن نشد",
                    true,
                  )
                }
              >
                <MonitorUp className={icon} />
              </ControlButton>
            )}
            <ControlButton
              className={size}
              label={settings.lowData ? "خاموش کردن حالت کم‌مصرف" : "حالت کم‌مصرف: فقط صدا دریافت شود"}
              active={settings.lowData}
              onClick={() => settings.setLowData(!settings.lowData)}
            >
              <Gauge className={icon} />
            </ControlButton>
          </>
        )}
        <ControlButton
          className={cn(
            size,
            "bg-danger text-white shadow-lg shadow-danger/30 hover:bg-danger/85",
            compact && "ms-auto",
          )}
          label="قطع اتصال"
          onClick={onLeave}
        >
          <PhoneOff className={icon} />
        </ControlButton>
      </div>
      {error && <p className="px-1 text-center text-xs text-danger">{error}</p>}
    </div>
  );
}

export function ControlButton({
  label,
  onClick,
  off,
  active,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  off?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid shrink-0 place-items-center rounded-full transition active:scale-95",
        off
          ? "bg-danger/15 text-danger"
          : active
            ? "bg-accent-strong text-white shadow-lg shadow-accent-strong/30"
            : "bg-ink-800 text-fg ring-1 ring-white/5 hover:bg-ink-700",
        className,
      )}
    >
      {children}
    </button>
  );
}
