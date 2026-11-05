"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioPlayback } from "@livekit/components-react";
import {
  DisconnectReason,
  LocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import { api } from "@/lib/api";
import type { ChannelDTO } from "@/lib/types";
import { acquireMic, micErrorMessage, readLowDataPref, videoKey, voiceUnsupportedReason, writeLowDataPref } from "@/lib/voice";

export interface VoiceConnection {
  channelId: string;
  serverId: string;
  channelName: string;
  serverName: string;
}

export interface VoiceSettings {
  deafened: boolean;
  lowData: boolean;
  setDeafened: (v: boolean) => void;
  setLowData: (v: boolean) => void;
  /** In low-data mode, the cameras and screens (by `videoKey`) the person chose to receive anyway. */
  allowedVideo: ReadonlySet<string>;
  setVideoAllowed: (key: string, allowed: boolean) => void;
}

/**
 * Low-data mode receives only voices. A camera or screen (with its sound) comes through only after the person asks
 * for that one, and then capped at a lower quality: low for faces, medium for screens so text stays readable.
 */
function applyLowData(pub: RemoteTrackPublication, identity: string, lowData: boolean, allowed: ReadonlySet<string>) {
  const voice = pub.kind === Track.Kind.Audio && pub.source !== Track.Source.ScreenShareAudio;
  const wanted = voice || !lowData || allowed.has(videoKey(identity, pub.source));
  pub.setSubscribed(wanted);
  if (wanted && pub.kind === Track.Kind.Video) {
    pub.setVideoQuality(
      !lowData ? VideoQuality.HIGH : pub.source === Track.Source.ScreenShare ? VideoQuality.MEDIUM : VideoQuality.LOW,
    );
  }
}

/** The LiveKit room you talk in: joining and leaving a voice channel, deafen, and low-data mode. */
export function useVoice({ notify }: { notify: (message: string) => void }) {
  const [connection, setConnection] = useState<VoiceConnection | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [deafened, setDeafened] = useState(false);
  const [lowData, setLowData] = useState(false);
  const [allowedVideo, setAllowedVideo] = useState<ReadonlySet<string>>(new Set());
  const lowDataRef = useRef(lowData);
  const allowedVideoRef = useRef(allowedVideo);
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        publishDefaults: { dtx: true, red: true, simulcast: true },
      }),
  );

  /** Leaves because the channel went away or the person lost access to it. */
  const dropCall = useCallback(() => {
    room.disconnect();
    setConnection(null);
    notify("کانال صوتی دیگر در دسترس نیست");
  }, [room, notify]);

  // Room lifecycle: drop the connection UI if LiveKit kicks us out or the network dies.
  useEffect(() => {
    const onDisconnected = (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.CLIENT_INITIATED) return;
      setConnection(null);
      notify("اتصال صوتی قطع شد");
    };
    // Catch new feeds as soon as they're announced, before much video has been spent on them.
    const onPublished = (pub: RemoteTrackPublication, participant: RemoteParticipant) =>
      applyLowData(pub, participant.identity, lowDataRef.current, allowedVideoRef.current);
    const onSubscribed = (_track: unknown, pub: RemoteTrackPublication, participant: RemoteParticipant) =>
      onPublished(pub, participant);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.TrackPublished, onPublished);
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.TrackPublished, onPublished);
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.disconnect();
    };
  }, [room, notify]);

  // Low-data mode is a per-device choice; read it after hydration so server and client markup match.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLowData(readLowDataPref());
  }, []);

  // Low-data mode: keep voices, drop video and screen sound except the feeds the person asked for.
  useEffect(() => {
    lowDataRef.current = lowData;
    allowedVideoRef.current = allowedVideo;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) applyLowData(pub, p.identity, lowData, allowedVideo);
    }
  }, [lowData, allowedVideo, room, connection]);

  const changeLowData = useCallback((on: boolean) => {
    writeLowDataPref(on);
    setLowData(on);
    // Turning it back on starts from nothing let through again.
    setAllowedVideo(new Set());
  }, []);
  const setVideoAllowed = useCallback((key: string, allowed: boolean) => {
    setAllowedVideo((prev) => {
      const next = new Set(prev);
      if (allowed) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Safari blocks sound until the page is tapped; when that happens this offers a button to turn it on.
  const { canPlayAudio, startAudio } = useAudioPlayback(room);

  const joinVoice = async (channel: ChannelDTO, serverName: string) => {
    if (connection?.channelId === channel.id || joiningId) return;
    const unsupported = voiceUnsupportedReason();
    if (unsupported) return notify(unsupported);
    setJoiningId(channel.id);

    // Safari and phones only honour sound and the mic prompt from inside the tap itself, so start
    // both before the first await; the token request and connection below would use up the gesture.
    room.startAudio().catch(() => {});
    const mic = deafened ? null : acquireMic(room.options.audioCaptureDefaults);

    try {
      const { token, url } = await api<{ token: string; url: string }>("/api/livekit/token", {
        body: { channelId: channel.id },
      });
      if (room.state !== "disconnected") await room.disconnect();
      await room.connect(url, token);
      setAllowedVideo(new Set());
      setConnection({ channelId: channel.id, serverId: channel.serverId, channelName: channel.name, serverName });
    } catch (err) {
      console.error(err);
      notify(
        navigator.onLine === false
          ? "اتصال اینترنت برقرار نیست"
          : "اتصال به کانال صوتی برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید",
      );
      // Switching channels already left the old one, so don't keep showing it as connected.
      if (room.state !== "disconnected") room.disconnect().catch(() => {});
      setConnection(null);
      mic?.then((t) => t instanceof LocalAudioTrack && t.stop());
      setJoiningId(null);
      return;
    }

    // Connected. A missing microphone only means this person listens.
    let published = false;
    try {
      const track = await mic;
      if (track instanceof LocalAudioTrack) {
        await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
        published = true;
      } else if (track) {
        notify(micErrorMessage(track));
      }
    } catch (err) {
      console.error(err);
      notify(micErrorMessage(err));
    } finally {
      setJoiningId(null);
      // Don't leave the mic (and the browser's recording indicator) on if it never got published.
      if (!published) mic?.then((t) => t instanceof LocalAudioTrack && t.stop());
    }
    // An active microphone lets iOS play everyone else's audio without another tap.
    room.startAudio().catch(() => {});
  };

  const leaveVoice = async () => {
    await room.disconnect();
    setConnection(null);
  };

  const settings: VoiceSettings = { deafened, lowData, setDeafened, setLowData: changeLowData, allowedVideo, setVideoAllowed };

  return { room, connection, connectionRef, joiningId, settings, canPlayAudio, startAudio, joinVoice, leaveVoice, dropCall };
}
