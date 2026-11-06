"use client";

import { useEffect, useRef } from "react";
import { onDesktopEvent, setDesktopVoice } from "@/lib/desktop";
import type { VoiceConnection, VoiceSettings } from "./useVoice";
import { useVoiceToggles } from "./VoiceControls";

/** Desktop app only: keeps the tray menu's Mute, Deafen and Leave in step with the call, and carries them out. */
export default function DesktopVoice({
  connection,
  settings,
  onLeave,
}: {
  connection: VoiceConnection;
  settings: VoiceSettings;
  onLeave: () => void;
}) {
  const { isMicrophoneEnabled, toggleMic, toggleDeafen } = useVoiceToggles(settings);
  const { channelName, serverName } = connection;
  const { deafened } = settings;

  useEffect(() => {
    setDesktopVoice({ channel: channelName, server: serverName, muted: !isMicrophoneEnabled, deafened });
  }, [channelName, serverName, isMicrophoneEnabled, deafened]);
  useEffect(() => () => setDesktopVoice(null), []);

  const latest = useRef({ mute: toggleMic, deafen: toggleDeafen, leave: onLeave, report: () => {} });
  useEffect(() => {
    latest.current = {
      mute: toggleMic,
      deafen: toggleDeafen,
      leave: onLeave,
      report: () => setDesktopVoice({ channel: channelName, server: serverName, muted: !isMicrophoneEnabled, deafened }),
    };
  });
  useEffect(
    () =>
      onDesktopEvent((e) => {
        if (e.type !== "voice") return;
        // The menu ticks its checkbox itself; if the toggle failed, put it back the way the call really is.
        Promise.resolve(latest.current[e.action]()).finally(() => latest.current.report());
      }),
    [],
  );

  return null;
}
