"use client";

import "@livekit/components-styles";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoomAudioRenderer, RoomContext, useAudioPlayback } from "@livekit/components-react";
import { DisconnectReason, LocalAudioTrack, Room, RoomEvent, Track, type RemoteTrackPublication } from "livekit-client";
import { Hash, Menu, PanelLeft, Phone, Search, Users, Volume2, VolumeX, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import { useCloseOnBack, useSwipe } from "@/lib/mobile";
import { showNotification } from "@/lib/notifications";
import { getSocket } from "@/lib/socket";
import { acquireMic, micErrorMessage, voiceUnsupportedReason } from "@/lib/voice";
import type {
  ChannelDTO,
  LiveMessageDTO,
  MeDTO,
  MemberDTO,
  ServerDetailDTO,
  ServerDTO,
  VoiceParticipant,
  VoiceStates,
} from "@/lib/types";
import ChannelSidebar from "./ChannelSidebar";
import ChatView from "./ChatView";
import { CreateChannelDialog, ProfileDialog, ServerDialog } from "./Dialogs";
import MembersList from "./MembersList";
import ServerRail from "./ServerRail";
import VoiceBar from "./VoiceBar";
import VoiceView from "./VoiceView";

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
}

type Dialog = { kind: "server" } | { kind: "profile" } | { kind: "channel"; type: ChannelDTO["type"] } | null;

/** channelId → unread messages that arrived while the channel wasn't on screen */
export type Unread = Record<string, { serverId: string; count: number }>;

export default function App({
  me: initialMe,
  initialServers,
  initialServerId,
}: {
  me: MeDTO;
  initialServers: ServerDTO[];
  initialServerId?: string;
}) {
  const [me, setMe] = useState(initialMe);
  const [servers, setServers] = useState(initialServers);
  const [activeServerId, setActiveServerId] = useState<string | undefined>(initialServerId);
  const [detail, setDetail] = useState<ServerDetailDTO | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [voiceStates, setVoiceStates] = useState<VoiceStates>({});
  const [connection, setConnection] = useState<VoiceConnection | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [deafened, setDeafened] = useState(false);
  const [lowData, setLowData] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [infoHidden, setInfoHidden] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [unread, setUnread] = useState<Unread>({});
  const [toast, setToast] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const lastChannelByServer = useRef<Record<string, string>>({});
  const lowDataRef = useRef(lowData);
  const activeChannelRef = useRef(activeChannelId);
  const serversRef = useRef(servers);

  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        publishDefaults: { dtx: true, red: true, simulcast: true },
      }),
  );

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeMembers = useCallback(() => setMembersOpen(false), []);
  const hideInfo = useCallback(() => {
    setMembersOpen(false);
    setInfoHidden(true);
  }, []);
  useCloseOnBack(sidebarOpen, closeSidebar);
  useCloseOnBack(membersOpen, closeMembers);

  // Phones: swipe from the start edge's direction for channels, the other way for members.
  const mainSwipe = useSwipe((toward) => {
    if (toward === "end" && window.matchMedia("(max-width: 47.99rem)").matches) setSidebarOpen(true);
    if (toward === "start" && window.matchMedia("(max-width: 79.99rem)").matches) setMembersOpen(true);
  });
  const sidebarSwipe = useSwipe((toward) => toward === "start" && setSidebarOpen(false));

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 5000);
  }, []);

  // Server detail (channels, members, who is in voice) for the selected server.
  useEffect(() => {
    if (!activeServerId) return;
    let cancelled = false;
    api<ServerDetailDTO>(`/api/servers/${activeServerId}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setVoiceStates((prev) => {
          const next = { ...prev };
          for (const c of d.channels) if (c.type === "voice") next[c.id] = d.voice[c.id] ?? [];
          return next;
        });
        setActiveChannelId((current) => {
          if (current && d.channels.some((c) => c.id === current)) return current;
          const remembered = lastChannelByServer.current[d.server.id];
          if (remembered && d.channels.some((c) => c.id === remembered)) return remembered;
          return (d.channels.find((c) => c.type === "text") ?? d.channels[0])?.id ?? null;
        });
      })
      .catch((err) => !cancelled && notify(err.message));
    return () => {
      cancelled = true;
    };
  }, [activeServerId, reloadKey, notify]);

  // Live updates pushed by the server.
  useEffect(() => {
    const socket = getSocket();
    let connectedOnce = false;
    const onConnect = () => {
      // After a reconnect we may have missed events; refetch the current server.
      if (connectedOnce) setReloadKey((k) => k + 1);
      connectedOnce = true;
    };
    const onChannel = (c: ChannelDTO) =>
      setDetail((d) =>
        d && d.server.id === c.serverId && !d.channels.some((x) => x.id === c.id)
          ? { ...d, channels: [...d.channels, c] }
          : d,
      );
    const onMember = ({ serverId, member }: { serverId: string; member: MemberDTO }) =>
      setDetail((d) =>
        d && d.server.id === serverId && !d.members.some((m) => m.user.id === member.user.id)
          ? { ...d, members: [...d.members, member] }
          : d,
      );
    const onVoice = ({ channelId, participants }: { channelId: string; participants: VoiceParticipant[] }) =>
      setVoiceStates((v) => ({ ...v, [channelId]: participants }));

    const onMessage = (m: LiveMessageDTO) => {
      if (m.author.id === initialMe.id) return;
      const onScreen = m.channelId === activeChannelRef.current && document.visibilityState === "visible";
      if (!onScreen) {
        setUnread((u) => ({ ...u, [m.channelId]: { serverId: m.serverId, count: (u[m.channelId]?.count ?? 0) + 1 } }));
        const serverName = serversRef.current.find((s) => s.id === m.serverId)?.name;
        showNotification(serverName ? `${m.author.name} در ${serverName}` : m.author.name, m.content, m.channelId);
      }
    };

    if (socket.connected) connectedOnce = true;
    socket.on("connect", onConnect);
    socket.on("message:new", onMessage);
    socket.on("channel:new", onChannel);
    socket.on("member:new", onMember);
    socket.on("voice:state", onVoice);
    return () => {
      socket.off("connect", onConnect);
      socket.off("message:new", onMessage);
      socket.off("channel:new", onChannel);
      socket.off("member:new", onMember);
      socket.off("voice:state", onVoice);
    };
  }, [initialMe.id]);

  // The channel on screen is read; so is the active one again when the tab comes back to the front.
  useEffect(() => {
    activeChannelRef.current = activeChannelId;
    serversRef.current = servers;
    const markRead = () => {
      const id = activeChannelRef.current;
      if (id && document.visibilityState === "visible")
        setUnread((u) => {
          if (!u[id]) return u;
          const rest = { ...u };
          delete rest[id];
          return rest;
        });
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [activeChannelId, servers]);

  const unreadTotal = Object.values(unread).reduce((n, u) => n + u.count, 0);
  useEffect(() => {
    document.title = unreadTotal ? `(${toPersianDigits(unreadTotal)}) صدامون` : "صدامون";
  }, [unreadTotal]);

  // Room lifecycle: drop the connection UI if LiveKit kicks us out or the network dies.
  useEffect(() => {
    const onDisconnected = (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.CLIENT_INITIATED) return;
      setConnection(null);
      notify("اتصال صوتی قطع شد");
    };
    const onSubscribed = (_track: unknown, pub: RemoteTrackPublication) => {
      if (lowDataRef.current && pub.kind === Track.Kind.Video) pub.setSubscribed(false);
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.disconnect();
    };
  }, [room, notify]);

  // Low-data mode: stop receiving video, keep audio.
  useEffect(() => {
    lowDataRef.current = lowData;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.kind === Track.Kind.Video) pub.setSubscribed(!lowData);
      }
    }
  }, [lowData, room, connection]);

  // Safari blocks sound until the page is tapped; when that happens this offers a button to turn it on.
  const { canPlayAudio, startAudio } = useAudioPlayback(room);

  const joinVoice = async (channel: ChannelDTO) => {
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
      setConnection({
        channelId: channel.id,
        serverId: channel.serverId,
        channelName: channel.name,
        serverName: detail?.server.name ?? "",
      });
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

  const selectServer = (id: string) => {
    if (id !== activeServerId) {
      setSearch(null);
      setDetail(null);
      setActiveChannelId(null);
      setActiveServerId(id);
    }
  };

  const selectChannel = (channel: ChannelDTO) => {
    if (channel.id !== activeChannelId) setSearch(null);
    setActiveChannelId(channel.id);
    lastChannelByServer.current[channel.serverId] = channel.id;
    setSidebarOpen(false);
    if (channel.type === "voice" && !connection) joinVoice(channel);
  };

  const openConnectedChannel = () => {
    if (!connection) return;
    lastChannelByServer.current[connection.serverId] = connection.channelId;
    if (connection.serverId === activeServerId) setActiveChannelId(connection.channelId);
    else selectServer(connection.serverId);
  };

  const addServer = (server: ServerDTO) => {
    setServers((list) => (list.some((s) => s.id === server.id) ? list : [...list, server]));
    selectServer(server.id);
    setDialog(null);
  };

  const currentDetail = detail?.server.id === activeServerId ? detail : null;
  const channel = currentDetail?.channels.find((c) => c.id === activeChannelId) ?? null;
  const settings: VoiceSettings = { deafened, lowData, setDeafened, setLowData };
  const inVoice = currentDetail?.channels.reduce((n, c) => n + (voiceStates[c.id]?.length ?? 0), 0) ?? 0;

  const firstVoice = currentDetail?.channels.find((c) => c.type === "voice");
  const startCall = () => {
    if (connection) openConnectedChannel();
    else if (firstVoice) selectChannel(firstVoice);
  };
  const serverUnread: Record<string, number> = {};
  for (const u of Object.values(unread)) serverUnread[u.serverId] = (serverUnread[u.serverId] ?? 0) + u.count;

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer muted={deafened} />
      <div className="flex h-dvh overflow-hidden bg-ink-950 pt-safe px-safe">
        <div
          className={cn(
            "fixed inset-0 z-20 bg-black/60 backdrop-blur-sm transition-opacity md:hidden",
            sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={closeSidebar}
          {...sidebarSwipe}
        />
        <aside
          {...sidebarSwipe}
          className={cn(
            "z-30 flex shrink-0 select-none",
            "max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:bg-ink-950 max-md:pt-safe max-md:shadow-2xl max-md:transition-[translate,visibility] max-md:duration-200 max-md:ease-out",
            !sidebarOpen && "max-md:invisible ltr:max-md:-translate-x-full rtl:max-md:translate-x-full",
          )}
        >
          <ServerRail
            me={me}
            servers={servers}
            activeId={activeServerId}
            unread={serverUnread}
            onSelect={selectServer}
            onAdd={() => setDialog({ kind: "server" })}
            onProfile={() => setDialog({ kind: "profile" })}
          />
          <ChannelSidebar
            me={me}
            detail={currentDetail}
            activeChannelId={activeChannelId}
            voiceStates={voiceStates}
            unread={unread}
            connection={connection}
            joiningId={joiningId}
            settings={settings}
            onSelect={selectChannel}
            onAddChannel={(type) => setDialog({ kind: "channel", type })}
            onLeaveVoice={leaveVoice}
            onProfile={() => setDialog({ kind: "profile" })}
            onNotify={notify}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col" {...mainSwipe}>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/5 bg-ink-900/60 px-2 backdrop-blur select-none md:gap-3 md:px-5">
            <HeaderButton className="md:hidden" label="منو" onClick={() => setSidebarOpen(true)}>
              <Menu className="size-5" />
              {unreadTotal > 0 && <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-accent" />}
            </HeaderButton>

            {search !== null ? (
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-ink-950 px-3 ring-1 ring-accent/50">
                <Search className="size-4 shrink-0 text-muted" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setSearch(null)}
                  placeholder={`جست‌وجو در #${channel?.name ?? ""}`}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted/70"
                />
                <button onClick={() => setSearch(null)} aria-label="بستن جست‌وجو" className="-me-1 p-1 text-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              </label>
            ) : (
              channel &&
              currentDetail && (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-linear-135 from-accent/25 to-accent-strong/10 text-accent ring-1 ring-accent/20">
                    {channel.type === "text" ? <Hash className="size-5" /> : <Volume2 className="size-5" />}
                  </span>
                  <div className="min-w-0 leading-5">
                    <h2 className="truncate font-semibold">{channel.name}</h2>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                      {toPersianDigits(currentDetail.members.length)} عضو
                      <span className="size-1 rounded-full bg-muted/60" />
                      <span className={inVoice ? "text-online" : undefined}>{toPersianDigits(inVoice)} در گفت‌وگو</span>
                    </p>
                  </div>
                </div>
              )
            )}

            {currentDetail && (
              <div className="ms-auto flex shrink-0 items-center gap-0.5">
                {(connection || firstVoice) && channel?.id !== connection?.channelId && search === null && (
                  <HeaderButton label={connection ? "بازگشت به تماس" : "شروع گفت‌وگوی صوتی"} onClick={startCall}>
                    <Phone className={cn("size-5", connection && "text-online")} />
                  </HeaderButton>
                )}
                {channel?.type === "text" && search === null && (
                  <HeaderButton label="جست‌وجو در پیام‌ها" onClick={() => setSearch("")}>
                    <Search className="size-5" />
                  </HeaderButton>
                )}
                <HeaderButton
                  className={cn(!infoHidden && "xl:hidden", "text-accent")}
                  label="اطلاعات سرور"
                  onClick={() => {
                    setInfoHidden(false);
                    setMembersOpen(true);
                  }}
                >
                  <PanelLeft className="size-5 ltr:-scale-x-100" />
                </HeaderButton>
              </div>
            )}
          </header>

          {connection && !canPlayAudio && !deafened && (
            <button
              onClick={() => startAudio().catch(() => notify("پخش صدا ممکن نشد. دوباره ضربه بزنید"))}
              className="flex shrink-0 items-center justify-center gap-2 border-b border-white/5 bg-accent-strong px-3 py-2.5 text-sm font-semibold text-white select-none"
            >
              <VolumeX className="size-4 shrink-0" />
              مرورگر صدای تماس را متوقف کرده است. برای شنیدن ضربه بزنید
            </button>
          )}

          {connection && channel?.id !== connection.channelId && (
            <VoiceBar connection={connection} settings={settings} onOpen={openConnectedChannel} onLeave={leaveVoice} />
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!servers.length ? (
              <EmptyState onAdd={() => setDialog({ kind: "server" })} />
            ) : channel?.type === "text" ? (
              <ChatView key={channel.id} me={me} channel={channel} search={search?.trim() ?? ""} />
            ) : channel?.type === "voice" ? (
              <VoiceView
                channel={channel}
                participants={voiceStates[channel.id] ?? []}
                connection={connection}
                joining={joiningId === channel.id}
                settings={settings}
                onJoin={() => joinVoice(channel)}
                onLeave={leaveVoice}
              />
            ) : (
              <div className="bg-glow flex-1" />
            )}
          </div>
        </main>

        {currentDetail && (
          <MembersList
            server={currentDetail.server}
            members={currentDetail.members}
            channels={currentDetail.channels}
            voiceStates={voiceStates}
            open={membersOpen}
            hidden={infoHidden}
            onClose={hideInfo}
            onNotify={notify}
          />
        )}
      </div>

      {dialog?.kind === "server" && <ServerDialog onClose={() => setDialog(null)} onDone={addServer} />}
      {dialog?.kind === "profile" && (
        <ProfileDialog
          me={me}
          onClose={() => setDialog(null)}
          onDone={(updated) => {
            setMe(updated);
            setDialog(null);
            notify("نام شما ذخیره شد");
          }}
          onNotify={notify}
        />
      )}
      {dialog?.kind === "channel" && currentDetail && (
        <CreateChannelDialog
          serverId={currentDetail.server.id}
          type={dialog.type}
          onClose={() => setDialog(null)}
          onDone={(c) => {
            onChannelCreated(c);
            setDialog(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+4.5rem)] left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl bg-ink-800/95 px-4 py-2.5 text-center text-sm leading-6 shadow-2xl ring-1 ring-white/10 backdrop-blur">
          {toast}
        </div>
      )}
    </RoomContext.Provider>
  );

  function onChannelCreated(c: ChannelDTO) {
    setDetail((d) => (d && !d.channels.some((x) => x.id === c.id) ? { ...d, channels: [...d.channels, c] } : d));
    selectChannel(c);
  }
}

function HeaderButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-ink-800 hover:text-fg active:bg-ink-800",
        className,
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-glow grid flex-1 place-items-center p-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-accent-strong text-white shadow-2xl shadow-accent-strong/40">
          <Users className="size-9" />
        </span>
        <h2 className="mt-6 text-xl font-bold">هنوز عضو هیچ سروری نیستید</h2>
        <p className="mt-2 text-sm leading-6 text-muted">یک سرور بسازید و دوستانتان را دعوت کنید، یا با لینک دعوت به سرور آن‌ها بپیوندید.</p>
        <button
          onClick={onAdd}
          className="mt-6 rounded-xl bg-accent-strong px-6 py-3 font-semibold text-white shadow-lg shadow-accent-strong/30 hover:bg-accent"
        >
          ساختن یا پیوستن
        </button>
      </div>
    </div>
  );
}
