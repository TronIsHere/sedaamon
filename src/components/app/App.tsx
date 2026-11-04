"use client";

import "@livekit/components-styles";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoomAudioRenderer, RoomContext, useAudioPlayback } from "@livekit/components-react";
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
import { Bell, Compass, Hash, Lock, Menu, MessageCircle, PanelLeft, Phone, Search, Settings, Users, Volume2, VolumeX, X } from "lucide-react";
import { api } from "@/lib/api";
import { messageSummary } from "@/lib/attachments";
import { cn } from "@/lib/format";
import { can, isMuted, ROLE_LABEL } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import { useCloseOnBack, useSwipe } from "@/lib/mobile";
import { pingsUser } from "@/lib/mentions";
import { showNotification } from "@/lib/notifications";
import { statusLine } from "@/lib/status";
import { getSocket } from "@/lib/socket";
import { useToast } from "@/components/ui/toast";
import {
  acquireMic,
  micErrorMessage,
  readLowDataPref,
  videoKey,
  voiceUnsupportedReason,
  writeLowDataPref,
} from "@/lib/voice";
import {
  DM_SCOPE,
  type ChannelDTO,
  type DmDTO,
  type DmListDTO,
  type EventAlert,
  type EventDTO,
  type FriendsDTO,
  type LiveMessageDTO,
  type MeDTO,
  type MemberDTO,
  type NotificationDTO,
  type PresenceEvent,
  type UserDTO,
  type ServerDetailDTO,
  type ServerDTO,
  type VoiceParticipant,
  type VoiceStates,
} from "@/lib/types";
import Avatar from "./Avatar";
import ChannelSidebar from "./ChannelSidebar";
import ChatView from "./ChatView";
import DiscoverDialog from "./DiscoverDialog";
import { CreateChannelDialog, EditChannelDialog, ProfileDialog, ServerDialog } from "./Dialogs";
import EventsDialog, { formatEventWhen } from "./EventsDialog";
import FriendsDialog from "./FriendsDialog";
import MembersList from "./MembersList";
import NotificationsDialog, { PING_ICON, PING_TEXT } from "./NotificationsDialog";
import ProfileCard from "./ProfileCard";
import ProfileMenu from "./ProfileMenu";
import ServerRail, { Badge } from "./ServerRail";
import ServerSettingsDialog from "./ServerSettingsDialog";
import VoiceBar from "./VoiceBar";
import VoiceView from "./VoiceView";
import WelcomeDialog from "./WelcomeDialog";
import { WatchProvider } from "./WatchTogether";

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

type Dialog =
  | { kind: "server" }
  | { kind: "profile" }
  | { kind: "serverSettings" }
  | { kind: "events" }
  | { kind: "friends" }
  | { kind: "discover" }
  | { kind: "welcome" }
  | { kind: "notifications" }
  | { kind: "user"; userId: string }
  | { kind: "channel"; type: ChannelDTO["type"] }
  | { kind: "editChannel"; channelId: string }
  | null;

/** channelId → unread messages that arrived while the channel wasn't on screen */
export type Unread = Record<string, { serverId: string; count: number; /** Of those, how many ping me. */ mentions: number }>;

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
  const [allowedVideo, setAllowedVideo] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [infoHidden, setInfoHidden] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [unread, setUnread] = useState<Unread>({});
  /** Pings (mentions, @everyone, replies) newest first; null until the first load. */
  const [notifications, setNotifications] = useState<NotificationDTO[] | null>(null);
  /** userId → connected right now. Fed by server details, the friend list and live "presence" events. */
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [friends, setFriends] = useState<FriendsDTO | null>(null);
  const [dms, setDms] = useState<DmDTO[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const lastChannelByServer = useRef<Record<string, string>>({});
  /** Servers whose welcome screen was already put in front of the person in this visit. */
  const welcomeShown = useRef(new Set<string>());
  const lowDataRef = useRef(lowData);
  const allowedVideoRef = useRef(allowedVideo);
  const activeChannelRef = useRef(activeChannelId);
  const serversRef = useRef(servers);
  const activeServerRef = useRef(activeServerId);
  const detailRef = useRef(detail);
  const connectionRef = useRef(connection);
  const dmsRef = useRef(dms);
  const notificationsRef = useRef(notifications);
  /** Latest openers for toast taps; the socket handlers outlive the render that made them. */
  const openFromToast = useRef<{ ping: (n: NotificationDTO) => void; dm: (userId: string) => void } | null>(null);
  const { toast, dismiss: dismissToast } = useToast();

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
    toast({ id: `notice:${message}`, title: message });
  }, [toast]);

  const refreshNotifications = useCallback(
    () =>
      api<{ notifications: NotificationDTO[] }>("/api/notifications")
        .then((res) => setNotifications(res.notifications))
        .catch(() => setNotifications((n) => n ?? [])),
    [],
  );
  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  /** Marks the pings of one channel read, on screen and on the server. */
  const markChannelPingsRead = useCallback((channelId: string) => {
    if (!notificationsRef.current?.some((n) => n.channelId === channelId && !n.read)) return;
    setNotifications((list) => list && list.map((n) => (n.channelId === channelId ? { ...n, read: true } : n)));
    api("/api/notifications", { method: "PATCH", body: { channelId } }).catch(() => {});
  }, []);

  const markOnline = useCallback((ids: string[], onlineIds: string[]) => {
    const live = new Set(onlineIds);
    setOnline((o) => {
      const next = { ...o };
      for (const id of ids) next[id] = live.has(id);
      return next;
    });
  }, []);

  const refreshFriends = useCallback(
    () =>
      api<FriendsDTO>("/api/friends")
        .then((f) => {
          setFriends(f);
          markOnline(f.friends.map((u) => u.id), f.online);
        })
        .catch(() => {}),
    [markOnline],
  );
  useEffect(() => {
    refreshFriends();
  }, [refreshFriends]);

  const refreshDms = useCallback(
    () =>
      api<DmListDTO>("/api/dms")
        .then((res) => {
          // A conversation opened a moment ago has no messages yet, so the server doesn't list it; keep the one on screen.
          setDms((prev) => [...res.conversations, ...prev.filter((p) => p.id === activeChannelRef.current && !res.conversations.some((c) => c.id === p.id))]);
          markOnline(res.conversations.map((c) => c.peer.id), res.online);
          if (activeServerRef.current === DM_SCOPE && !activeChannelRef.current && res.conversations.length) {
            setActiveChannelId(lastChannelByServer.current[DM_SCOPE] ?? res.conversations[0].id);
          }
        })
        .catch(() => {}),
    [markOnline],
  );
  useEffect(() => {
    refreshDms();
  }, [refreshDms]);

  // Server detail (channels, members, who is in voice) for the selected server.
  useEffect(() => {
    if (!activeServerId || activeServerId === DM_SCOPE) return;
    let cancelled = false;
    api<ServerDetailDTO>(`/api/servers/${activeServerId}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        markOnline(d.members.map((m) => m.user.id), d.online);
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
  }, [activeServerId, reloadKey, notify, markOnline]);

  // A newcomer is greeted once per visit; the screen comes back on the next load until they finish it.
  useEffect(() => {
    if (!detail?.onboarding.welcomePending || !detail.welcome.enabled || welcomeShown.current.has(detail.server.id)) return;
    welcomeShown.current.add(detail.server.id);
    setDialog((d) => d ?? { kind: "welcome" });
  }, [detail]);

  const dropCall = useCallback(() => {
    room.disconnect();
    setConnection(null);
    notify("کانال صوتی دیگر در دسترس نیست");
  }, [room, notify]);

  // Live updates pushed by the server.
  useEffect(() => {
    const socket = getSocket();
    let connectedOnce = false;
    const onConnect = () => {
      // After a reconnect we may have missed events; refetch the current server.
      if (connectedOnce) {
        setReloadKey((k) => k + 1);
        refreshFriends();
        refreshDms();
        refreshNotifications();
      }
      connectedOnce = true;
    };
    const onChannel = (c: ChannelDTO) =>
      setDetail((d) =>
        d && d.server.id === c.serverId && !d.channels.some((x) => x.id === c.id)
          ? { ...d, channels: [...d.channels, c].sort((a, b) => a.position - b.position) }
          : d,
      );
    const onMember = ({ serverId, member }: { serverId: string; member: MemberDTO }) =>
      setDetail((d) =>
        d && d.server.id === serverId && !d.members.some((m) => m.user.id === member.user.id)
          ? { ...d, members: [...d.members, member] }
          : d,
      );
    const onMemberUpdate = ({ serverId, member }: { serverId: string; member: MemberDTO }) => {
      const mine = member.user.id === initialMe.id;
      setDetail((d) =>
        d && d.server.id === serverId
          ? {
              ...d,
              members: d.members.map((m) => (m.user.id === member.user.id ? member : m)),
              server: mine ? { ...d.server, role: member.role } : d.server,
            }
          : d,
      );
      if (!mine) return;
      const previous = serversRef.current.find((s) => s.id === serverId)?.role;
      setServers((list) => list.map((s) => (s.id === serverId ? { ...s, role: member.role } : s)));
      if (previous && previous !== member.role) {
        notify(`نقش شما در این سرور «${ROLE_LABEL[member.role]}» شد`);
        // A new role can open or close private channels, so the list is fetched again.
        setReloadKey((k) => k + 1);
      }
      else if (isMuted(member.mutedUntil)) notify("شما در این سرور بی‌صدا شده‌اید");
    };
    const onMemberRemove = ({ serverId, userId }: { serverId: string; userId: string }) =>
      setDetail((d) =>
        d && d.server.id === serverId ? { ...d, members: d.members.filter((m) => m.user.id !== userId) } : d,
      );
    const onServerUpdate = ({ id, name, inviteCode }: { id: string; name: string; inviteCode: string }) => {
      setServers((list) => list.map((s) => (s.id === id ? { ...s, name, inviteCode } : s)));
      setDetail((d) => (d && d.server.id === id ? { ...d, server: { ...d.server, name, inviteCode } } : d));
    };
    const onServerRemoved = ({ serverId, kicked, deleted }: { serverId: string; kicked: boolean; deleted?: boolean }) => {
      const name = serversRef.current.find((s) => s.id === serverId)?.name ?? "";
      const remaining = serversRef.current.filter((s) => s.id !== serverId);
      setServers(remaining);
      if (activeServerRef.current === serverId) {
        setSearch(null);
        setDetail(null);
        setActiveChannelId(null);
        setActiveServerId(remaining[0]?.id);
      }
      if (connectionRef.current?.serverId === serverId) dropCall();
      setUnread((u) => Object.fromEntries(Object.entries(u).filter(([, v]) => v.serverId !== serverId)));
      setNotifications((list) => list && list.filter((n) => n.serverId !== serverId));
      setDialog((d) => (d?.kind === "serverSettings" ? null : d));
      notify(deleted ? `سرور «${name}» حذف شد` : kicked ? `از سرور «${name}» اخراج شدید` : `از سرور «${name}» خارج شدید`);
    };
    const putEvent = (e: EventDTO) =>
      setDetail((d) =>
        d && d.server.id === e.serverId
          ? { ...d, events: [...d.events.filter((x) => x.id !== e.id), e].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) }
          : d,
      );
    const onEventDelete = ({ serverId, eventId }: { serverId: string; eventId: string }) =>
      setDetail((d) => (d && d.server.id === serverId ? { ...d, events: d.events.filter((x) => x.id !== eventId) } : d));
    const onEventAlert = ({ kind, event }: EventAlert) => {
      const text =
        kind === "start" ? `رویداد «${event.title}» شروع شد` : `رویداد «${event.title}» تا چند دقیقهٔ دیگر شروع می‌شود (${formatEventWhen(event.startsAt)})`;
      notify(text);
      // Only people who said they would come get a system notification.
      if (event.interested.includes(initialMe.id)) showNotification(serversRef.current.find((s) => s.id === event.serverId)?.name ?? "صدامون", text, `event:${event.id}:${kind}`);
    };
    // The welcome screen, its rules or the starter channels changed: fetch the server again.
    const onWelcomeChanged = ({ serverId }: { serverId: string }) => {
      if (serverId === activeServerRef.current) setReloadKey((k) => k + 1);
    };
    const onChannelUpdate = (c: ChannelDTO) =>
      setDetail((d) => (d && d.server.id === c.serverId ? { ...d, channels: d.channels.map((x) => (x.id === c.id ? c : x)) } : d));
    const onChannelDelete = ({ serverId, channelId }: { serverId: string; channelId: string }) => {
      setDetail((d) => (d && d.server.id === serverId ? { ...d, channels: d.channels.filter((x) => x.id !== channelId) } : d));
      if (activeChannelRef.current === channelId) {
        const rest = detailRef.current?.channels.filter((c) => c.id !== channelId) ?? [];
        setActiveChannelId((rest.find((c) => c.type === "text") ?? rest[0])?.id ?? null);
      }
      if (connectionRef.current?.channelId === channelId) dropCall();
    };
    // A name, picture or status changed. Replace that person wherever they are on screen.
    const onUserUpdate = (u: UserDTO) => {
      setMe((m) => (m.id === u.id ? { ...u, phone: m.phone, bio: m.bio } : m));
      setDetail((d) => (d?.members.some((m) => m.user.id === u.id) ? { ...d, members: d.members.map((m) => (m.user.id === u.id ? { ...m, user: u } : m)) } : d));
      const swap = (list: UserDTO[]) => list.map((x) => (x.id === u.id ? u : x));
      setFriends((f) => (f ? { ...f, friends: swap(f.friends), incoming: swap(f.incoming), outgoing: swap(f.outgoing) } : f));
      setDms((list) => (list.some((d) => d.peer.id === u.id) ? list.map((d) => (d.peer.id === u.id ? { ...d, peer: u } : d)) : list));
    };
    const onPresence = ({ userId, online: isOnline }: PresenceEvent) => setOnline((o) => (o[userId] === isOnline ? o : { ...o, [userId]: isOnline }));
    const onVoice = ({ channelId, participants }: { channelId: string; participants: VoiceParticipant[] }) =>
      setVoiceStates((v) => ({ ...v, [channelId]: participants }));

    const onMessage = (m: LiveMessageDTO) => {
      if (m.serverId === DM_SCOPE) {
        // A message in a conversation: float it to the top, or learn about a conversation someone just started.
        if (!dmsRef.current.some((d) => d.id === m.channelId)) refreshDms();
        else
          setDms((list) =>
            list
              .map((d) => (d.id === m.channelId ? { ...d, lastMessageAt: m.createdAt } : d))
              .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")),
          );
      }
      if (m.author.id === initialMe.id) return;
      const onScreen = m.channelId === activeChannelRef.current && document.visibilityState === "visible";
      if (!onScreen) {
        setUnread((u) => ({ ...u, [m.channelId]: { serverId: m.serverId, count: (u[m.channelId]?.count ?? 0) + 1, mentions: 0 } }));
        const serverName = serversRef.current.find((s) => s.id === m.serverId)?.name;
        const title = pingsUser(m, initialMe.id)
          ? `${m.author.name} شما را صدا زد${serverName ? ` (${serverName})` : ""}`
          : serverName
            ? `${m.author.name} در ${serverName}`
            : m.author.name;
        showNotification(title, messageSummary(m.content, m.attachments), m.channelId);
        // Pings get their own toast below; a direct message is the other thing worth interrupting for.
        if (m.serverId === DM_SCOPE)
          toast({
            id: `dm:${m.channelId}`,
            group: true,
            refs: [`msg:${m.id}`, `ch:${m.channelId}`],
            icon: <Avatar user={m.author} />,
            badge: <MessageCircle className="size-2.5" />,
            title: (count) =>
              count > 1 ? (
                <>
                  <span className="font-semibold">{toPersianDigits(String(count))} پیام</span> از {m.author.name}
                </>
              ) : (
                <>
                  <span className="font-semibold">{m.author.name}</span> برایتان پیام فرستاد
                </>
              ),
            description: messageSummary(m.content, m.attachments),
            onClick: () => openFromToast.current?.dm(m.author.id),
            duration: 6000,
          });
      }
    };

    // Someone pinged me. The banner is for when I'm not already looking at that channel.
    const onPing = (n: NotificationDTO) => {
      setNotifications((list) => (list?.some((x) => x.id === n.id) ? list : [n, ...(list ?? [])]));
      if (n.channelId === activeChannelRef.current && document.visibilityState === "visible") return;
      // Several pings from one person in one channel share a card: "3 messages from …".
      const KindIcon = PING_ICON[n.kind];
      toast({
        id: `ping:${n.author.id}:${n.channelId}`,
        group: true,
        refs: [`msg:${n.messageId}`, `ch:${n.channelId}`],
        icon: <Avatar user={n.author} />,
        badge: <KindIcon className="size-2.5" />,
        title: (count) =>
          count > 1 ? (
            <>
              <span className="font-semibold">{toPersianDigits(String(count))} پیام</span> از {n.author.name}
            </>
          ) : (
            <>
              <span className="font-semibold">{n.author.name}</span> {PING_TEXT[n.kind]}
            </>
          ),
        description: n.preview,
        meta: `#${n.channelName} · ${n.serverName}`,
        onClick: () => openFromToast.current?.ping(n),
        duration: 6000,
      });
    };
    const onMessageDelete = ({ messageId }: { messageId: string }) => {
      setNotifications((list) => list && list.filter((n) => n.messageId !== messageId));
      dismissToast(`msg:${messageId}`);
    };
    if (socket.connected) connectedOnce = true;
    socket.on("connect", onConnect);
    socket.on("message:new", onMessage);
    socket.on("notification:new", onPing);
    socket.on("message:delete", onMessageDelete);
    socket.on("channel:new", onChannel);
    socket.on("member:new", onMember);
    socket.on("voice:state", onVoice);
    socket.on("member:update", onMemberUpdate);
    socket.on("member:remove", onMemberRemove);
    socket.on("server:update", onServerUpdate);
    socket.on("server:removed", onServerRemoved);
    socket.on("event:new", putEvent);
    socket.on("event:update", putEvent);
    socket.on("event:delete", onEventDelete);
    socket.on("event:alert", onEventAlert);
    socket.on("welcome:changed", onWelcomeChanged);
    socket.on("channel:update", onChannelUpdate);
    socket.on("channel:delete", onChannelDelete);
    socket.on("presence", onPresence);
    socket.on("user:update", onUserUpdate);
    socket.on("friends:changed", refreshFriends);
    return () => {
      socket.off("connect", onConnect);
      socket.off("message:new", onMessage);
      socket.off("notification:new", onPing);
      socket.off("message:delete", onMessageDelete);
      socket.off("channel:new", onChannel);
      socket.off("member:new", onMember);
      socket.off("voice:state", onVoice);
      socket.off("member:update", onMemberUpdate);
      socket.off("member:remove", onMemberRemove);
      socket.off("server:update", onServerUpdate);
      socket.off("server:removed", onServerRemoved);
      socket.off("event:new", putEvent);
      socket.off("event:update", putEvent);
      socket.off("event:delete", onEventDelete);
      socket.off("event:alert", onEventAlert);
      socket.off("welcome:changed", onWelcomeChanged);
      socket.off("channel:update", onChannelUpdate);
      socket.off("channel:delete", onChannelDelete);
      socket.off("presence", onPresence);
      socket.off("user:update", onUserUpdate);
      socket.off("friends:changed", refreshFriends);
    };
  }, [initialMe.id, notify, toast, dismissToast, refreshFriends, refreshDms, refreshNotifications, dropCall]);

  // The channel on screen is read; so is the active one again when the tab comes back to the front.
  useEffect(() => {
    activeChannelRef.current = activeChannelId;
    serversRef.current = servers;
    activeServerRef.current = activeServerId;
    detailRef.current = detail;
    connectionRef.current = connection;
    dmsRef.current = dms;
    notificationsRef.current = notifications;
    const markRead = () => {
      const id = activeChannelRef.current;
      if (id && document.visibilityState === "visible") {
        markChannelPingsRead(id);
        dismissToast(`ch:${id}`);
        setUnread((u) => {
          if (!u[id]) return u;
          const rest = { ...u };
          delete rest[id];
          return rest;
        });
      }
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [activeChannelId, servers, activeServerId, detail, connection, dms, notifications, markChannelPingsRead, dismissToast]);

  // Unread pings come from the saved list, so they survive a reload; the live counts only know what arrived since.
  const unreadView: Unread = { ...unread };
  for (const n of notifications ?? []) {
    if (n.read) continue;
    const entry = unreadView[n.channelId] ?? { serverId: n.serverId, count: 0, mentions: 0 };
    unreadView[n.channelId] = { ...entry, mentions: entry.mentions + 1, count: Math.max(entry.count, entry.mentions + 1) };
  }
  const unreadPings = notifications?.filter((n) => !n.read).length ?? 0;
  const unreadTotal = Object.values(unreadView).reduce((n, u) => n + u.count, 0);
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
      setAllowedVideo(new Set());
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

  /** Opens the channel a ping came from. */
  const openNotification = (n: NotificationDTO) => {
    setDialog(null);
    dismissToast(`ch:${n.channelId}`);
    setSidebarOpen(false);
    lastChannelByServer.current[n.serverId] = n.channelId;
    if (n.serverId === activeServerId) {
      setSearch(null);
      setActiveChannelId(n.channelId);
    } else selectServer(n.serverId);
  };

  const readAllPings = () => {
    setNotifications((list) => list && list.map((n) => ({ ...n, read: true })));
    api("/api/notifications", { method: "PATCH", body: {} }).catch(() => {});
  };

  const clearPings = () => {
    setNotifications([]);
    api("/api/notifications", { method: "DELETE" }).catch(() => {});
  };

  const openProfile = (userId: string) => setDialog(userId === me.id ? { kind: "profile" } : { kind: "user", userId });

  const selectServer = (id: string) => {
    if (id !== activeServerId) {
      setSearch(null);
      setDetail(null);
      setActiveChannelId(id === DM_SCOPE ? (lastChannelByServer.current[DM_SCOPE] ?? dms[0]?.id ?? null) : null);
      setActiveServerId(id);
    }
  };

  const selectDm = (dm: DmDTO) => {
    if (dm.id !== activeChannelId) setSearch(null);
    setActiveChannelId(dm.id);
    lastChannelByServer.current[DM_SCOPE] = dm.id;
    setSidebarOpen(false);
  };

  const openDm = async (userId: string) => {
    try {
      const { dm } = await api<{ dm: DmDTO }>("/api/dms", { body: { userId } });
      setDms((list) => (list.some((d) => d.id === dm.id) ? list : [dm, ...list]));
      lastChannelByServer.current[DM_SCOPE] = dm.id;
      setDialog(null);
      setSearch(null);
      setDetail(null);
      setActiveServerId(DM_SCOPE);
      setActiveChannelId(dm.id);
      setSidebarOpen(false);
    } catch (err) {
      notify((err as Error).message);
    }
  };

  useEffect(() => {
    openFromToast.current = { ping: openNotification, dm: openDm };
  });

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
  const onlineNow = { ...online, [me.id]: true };
  const canManageChannels = !!currentDetail && can(currentDetail.server.role, "channel:manage");
  const dmMode = activeServerId === DM_SCOPE;
  const activeDm = dmMode ? (dms.find((d) => d.id === activeChannelId) ?? null) : null;
  // A conversation is shown through the same chat view as a text channel.
  const channel: ChannelDTO | null = activeDm
    ? { id: activeDm.id, serverId: DM_SCOPE, name: activeDm.peer.name, type: "text", position: 0, isPrivate: false, allowedRoles: [], allowedMembers: [] }
    : (currentDetail?.channels.find((c) => c.id === activeChannelId) ?? null);
  const dmMembers: MemberDTO[] = activeDm
    ? [
        { user: me, role: "member", mutedUntil: null, joinedAt: "", badges: [] },
        { user: activeDm.peer, role: "member", mutedUntil: null, joinedAt: "", badges: [] },
      ]
    : [];
  const settings: VoiceSettings = { deafened, lowData, setDeafened, setLowData: changeLowData, allowedVideo, setVideoAllowed };
  const inVoice = currentDetail?.channels.reduce((n, c) => n + (voiceStates[c.id]?.length ?? 0), 0) ?? 0;

  const firstVoice = currentDetail?.channels.find((c) => c.type === "voice");
  const startCall = () => {
    if (connection) openConnectedChannel();
    else if (firstVoice) selectChannel(firstVoice);
  };
  const serverUnread: Record<string, number> = {};
  const serverPings: Record<string, number> = {};
  for (const u of Object.values(unreadView)) {
    serverUnread[u.serverId] = (serverUnread[u.serverId] ?? 0) + u.count;
    serverPings[u.serverId] = (serverPings[u.serverId] ?? 0) + u.mentions;
  }

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer muted={deafened} />
      <WatchProvider onNotify={notify}>
        <div className="flex h-dvh overflow-hidden bg-ink-950 pt-safe px-safe md:gap-2 md:p-2">
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
              "z-30 flex shrink-0 select-none md:gap-2",
              "max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:bg-ink-950 max-md:pt-safe max-md:shadow-2xl max-md:transition-[translate,visibility] max-md:duration-200 max-md:ease-out",
              !sidebarOpen && "max-md:invisible ltr:max-md:-translate-x-full rtl:max-md:translate-x-full",
            )}
          >
            <ServerRail
              me={me}
              servers={servers}
              activeId={dmMode ? undefined : activeServerId}
              unread={serverUnread}
              pings={serverPings}
              onSelect={selectServer}
              onAdd={() => setDialog({ kind: "server" })}
              friendRequests={friends?.incoming.length ?? 0}
              dmActive={dmMode}
              dmUnread={serverUnread[DM_SCOPE] ?? 0}
              onDms={() => selectServer(DM_SCOPE)}
              onFriends={() => setDialog({ kind: "friends" })}
              onDiscover={() => setDialog({ kind: "discover" })}
              onProfile={() => setDialog({ kind: "profile" })}
            />
            <ChannelSidebar
              me={me}
              dm={
                dmMode
                  ? { conversations: dms, activeId: activeChannelId, online: onlineNow, onSelect: selectDm, onNew: () => setDialog({ kind: "friends" }) }
                  : undefined
              }
              detail={currentDetail}
              activeChannelId={activeChannelId}
              voiceStates={voiceStates}
              unread={unreadView}
              connection={connection}
              joiningId={joiningId}
              settings={settings}
              onSelect={selectChannel}
              onAddChannel={(type) => setDialog({ kind: "channel", type })}
              onEvents={() => setDialog({ kind: "events" })}
              onLeaveVoice={leaveVoice}
              onProfile={() => setDialog({ kind: "profile" })}
              onMeChange={setMe}
              onNotify={notify}
            />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col" {...mainSwipe}>
            <header className="relative z-10 flex h-16 shrink-0 items-center gap-2 px-2 select-none md:h-14 md:gap-3 md:px-1">
              <HeaderButton className="md:hidden" label="منو" onClick={() => setSidebarOpen(true)}>
                <Menu className="size-5" />
                {unreadTotal > 0 && <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-accent" />}
              </HeaderButton>

              {search !== null ? (
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-ink-900 px-4 ring-2 ring-accent/60">
                  <Search className="size-4 shrink-0 text-muted" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setSearch(null)}
                    placeholder={`جست‌وجو در ${activeDm ? "" : "#"}${channel?.name ?? ""}`}
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-base md:text-sm outline-none placeholder:text-muted"
                  />
                  <button onClick={() => setSearch(null)} aria-label="بستن جست‌وجو" className="-me-1.5 grid size-9 place-items-center rounded-lg text-muted hover:text-fg">
                    <X className="size-4" />
                  </button>
                </label>
              ) : (
                <>
                {activeDm && (
                  <button
                    onClick={() => openProfile(activeDm.peer.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-start"
                    aria-label={`پروفایل ${activeDm.peer.name}`}
                  >
                    <Avatar user={activeDm.peer} online={!!onlineNow[activeDm.peer.id]} />
                    <span className="min-w-0 leading-5">
                      <span className="block truncate text-lg font-bold md:text-xl">{activeDm.peer.name}</span>
                      <span dir="auto" className={cn("block truncate text-xs", onlineNow[activeDm.peer.id] ? "text-online" : "text-muted")}>
                        {(onlineNow[activeDm.peer.id] && statusLine(activeDm.peer)) || (onlineNow[activeDm.peer.id] ? "آنلاین" : "آفلاین")}
                      </span>
                    </span>
                  </button>
                )}
                {channel && currentDetail && (
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="hidden size-10 shrink-0 place-items-center rounded-full bg-ink-900 text-fg sm:grid">
                      {channel.type === "text" ? <Hash className="size-5" /> : <Volume2 className="size-5" />}
                    </span>
                    <div className="min-w-0 leading-5">
                      <h2 className="flex items-center gap-1.5 text-lg font-bold md:text-xl">
                        <span className="truncate">{channel.name}</span>
                        {channel.isPrivate && <Lock className="size-3.5 shrink-0 text-muted" aria-label="کانال خصوصی" />}
                      </h2>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                        {toPersianDigits(currentDetail.members.length)} عضو
                        <span className="size-1 rounded-full bg-muted/60" />
                        <span className={inVoice ? "text-online" : undefined}>{toPersianDigits(inVoice)} در گفت‌وگو</span>
                      </p>
                    </div>
                  </div>
                )}
                </>
              )}

              <div className="ms-auto flex shrink-0 items-center gap-1 md:gap-2">
                  {search === null && (
                    <HeaderButton label="اعلان‌ها" onClick={() => setDialog({ kind: "notifications" })}>
                      <Bell className={cn("size-5", unreadPings > 0 && "text-fg")} />
                      {unreadPings > 0 && <Badge count={unreadPings} ping className="absolute -end-0.5 -top-0.5 ring-2 ring-ink-900" />}
                    </HeaderButton>
                  )}
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
                  {channel && canManageChannels && search === null && (
                    <HeaderButton label="تنظیمات کانال" onClick={() => setDialog({ kind: "editChannel", channelId: channel.id })}>
                      <Settings className="size-5" />
                    </HeaderButton>
                  )}
                  {currentDetail && (
                    <HeaderButton
                      className={cn(!infoHidden && "xl:hidden")}
                      label="اطلاعات سرور"
                      onClick={() => {
                        setInfoHidden(false);
                        setMembersOpen(true);
                      }}
                    >
                      <PanelLeft className="size-5 ltr:-scale-x-100" />
                    </HeaderButton>
                  )}
                <ProfileMenu
                  me={me}
                  align="end"
                  onMeChange={setMe}
                  onSettings={() => setDialog({ kind: "profile" })}
                  onNotify={notify}
                >
                  {(trigger) => (
                    <button
                      {...trigger}
                      title="وضعیت و پروفایل"
                      aria-label="وضعیت و پروفایل"
                      className="hidden shrink-0 rounded-full transition-opacity hover:opacity-85 md:block"
                    >
                      <Avatar user={me} online />
                    </button>
                  )}
                </ProfileMenu>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ink-900 max-md:rounded-t-[1.75rem] md:rounded-[1.75rem]">

            {connection && !canPlayAudio && !deafened && (
              <button
                onClick={() => startAudio().catch(() => notify("پخش صدا ممکن نشد. دوباره ضربه بزنید"))}
                className="flex shrink-0 items-center justify-center gap-2 bg-accent-strong px-3 py-2.5 text-sm font-semibold text-on-accent select-none"
              >
                <VolumeX className="size-4 shrink-0" />
                مرورگر صدای تماس را متوقف کرده است. برای شنیدن ضربه بزنید
              </button>
            )}

            {connection && channel?.id !== connection.channelId && (
              <VoiceBar connection={connection} settings={settings} onOpen={openConnectedChannel} onLeave={leaveVoice} />
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!servers.length && !dmMode ? (
                <EmptyState onAdd={() => setDialog({ kind: "server" })} onDiscover={() => setDialog({ kind: "discover" })} />
              ) : dmMode && !activeDm ? (
                <NoConversation onFriends={() => setDialog({ kind: "friends" })} />
              ) : channel?.type === "text" ? (
                <ChatView
                  key={channel.id}
                  me={me}
                  channel={channel}
                  search={search?.trim() ?? ""}
                  members={currentDetail?.members ?? dmMembers}
                  online={onlineNow}
                  dm={activeDm?.peer}
                  rulesPending={!!currentDetail?.onboarding.rulesPending}
                  onOpenProfile={openProfile}
                  onOpenWelcome={() => setDialog({ kind: "welcome" })}
                  onNotify={notify}
                />
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
            </div>
          </main>

          {currentDetail && (
            <MembersList
              me={me}
              server={currentDetail.server}
              members={currentDetail.members}
              channels={currentDetail.channels}
              voiceStates={voiceStates}
              online={onlineNow}
              open={membersOpen}
              hidden={infoHidden}
              onClose={hideInfo}
              onOpenProfile={openProfile}
              onSettings={() => setDialog({ kind: "serverSettings" })}
              onNotify={notify}
            />
          )}
        </div>

        {dialog?.kind === "server" && <ServerDialog onClose={() => setDialog(null)} onDone={addServer} />}
        {dialog?.kind === "discover" && (
          <DiscoverDialog
            onClose={() => setDialog(null)}
            onJoined={addServer}
            onOpen={(id) => {
              setDialog(null);
              selectServer(id);
            }}
          />
        )}
        {dialog?.kind === "welcome" && currentDetail && (
          <WelcomeDialog
            server={currentDetail.server}
            welcome={currentDetail.welcome}
            channels={currentDetail.channels}
            onboarding={currentDetail.onboarding}
            onClose={() => setDialog(null)}
            onDone={(channelId) => {
              setDialog(null);
              setDetail((d) => (d ? { ...d, onboarding: { welcomePending: false, rulesPending: false } } : d));
              // A reload also fetches the rule-keeper badge the server just granted.
              setReloadKey((k) => k + 1);
              if (channelId) {
                lastChannelByServer.current[currentDetail.server.id] = channelId;
                setActiveChannelId(channelId);
              }
            }}
          />
        )}
        {dialog?.kind === "profile" && (
          <ProfileDialog
            me={me}
            onClose={() => setDialog(null)}
            onDone={(updated) => {
              setMe(updated);
              setDialog(null);
              notify("پروفایل شما ذخیره شد");
            }}
            onMeChange={setMe}
            onNotify={notify}
          />
        )}
        {dialog?.kind === "serverSettings" && currentDetail && (
          <ServerSettingsDialog
            server={currentDetail.server}
            members={currentDetail.members}
            channels={currentDetail.channels}
            discovery={currentDetail.discovery}
            welcome={currentDetail.welcome}
            meId={me.id}
            onClose={() => setDialog(null)}
            onChanged={(d) => {
              setDetail(d);
              setServers((list) => list.map((s) => (s.id === d.server.id ? d.server : s)));
            }}
            onNotify={notify}
          />
        )}
        {dialog?.kind === "events" && currentDetail && (
          <EventsDialog
            server={currentDetail.server}
            events={currentDetail.events}
            channels={currentDetail.channels}
            meId={me.id}
            onClose={() => setDialog(null)}
            onJoin={selectChannel}
            onNotify={notify}
          />
        )}
        {dialog?.kind === "notifications" && (
          <NotificationsDialog
            notifications={notifications}
            onOpen={openNotification}
            onReadAll={readAllPings}
            onClear={clearPings}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "friends" && (
          <FriendsDialog
            friends={friends}
            online={onlineNow}
            onClose={() => setDialog(null)}
            onOpenProfile={openProfile}
            onChanged={refreshFriends}
            onNotify={notify}
          />
        )}
        {dialog?.kind === "user" && (
          <ProfileCard
            key={dialog.userId}
            userId={dialog.userId}
            serverId={currentDetail?.server.id}
            myRole={currentDetail?.server.role}
            member={currentDetail?.members.find((m) => m.user.id === dialog.userId)}
            online={!!online[dialog.userId]}
            onClose={() => setDialog(null)}
            onNotify={notify}
            onFriendsChanged={refreshFriends}
            onMessage={openDm}
          />
        )}
        {dialog?.kind === "editChannel" && currentDetail?.channels.some((c) => c.id === dialog.channelId) && (
          <EditChannelDialog
            channel={currentDetail.channels.find((c) => c.id === dialog.channelId)!}
            members={currentDetail.members}
            onClose={() => setDialog(null)}
            onNotify={notify}
          />
        )}
        {dialog?.kind === "channel" && currentDetail && (
          <CreateChannelDialog
            serverId={currentDetail.server.id}
            members={currentDetail.members}
            type={dialog.type}
            onClose={() => setDialog(null)}
            onDone={(c) => {
              onChannelCreated(c);
              setDialog(null);
            }}
          />
        )}
      </WatchProvider>
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
        "relative grid size-10 shrink-0 place-items-center rounded-full text-fg/80 transition-colors duration-150 hover:bg-ink-800 hover:text-fg active:bg-ink-700 md:bg-ink-900",
        className,
      )}
    >
      {children}
    </button>
  );
}

function NoConversation({ onFriends }: { onFriends: () => void }) {
  return (
    <div className="bg-glow grid flex-1 place-items-center p-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-accent-strong text-on-accent">
          <MessageCircle className="size-9" />
        </span>
        <h2 className="mt-6 text-xl font-bold">پیام مستقیم</h2>
        <p className="mt-2 text-sm leading-6 text-muted">با دوستانتان و اعضای سرورهایتان خصوصی گفت‌وگو کنید. روی نام کسی بزنید و «ارسال پیام» را انتخاب کنید.</p>
        <button
          onClick={onFriends}
          className="btn-primary mt-6 px-6"
        >
          دوستان من
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd, onDiscover }: { onAdd: () => void; onDiscover: () => void }) {
  return (
    <div className="bg-glow grid flex-1 place-items-center p-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-accent-strong text-on-accent">
          <Users className="size-9" />
        </span>
        <h2 className="mt-6 text-xl font-bold">هنوز عضو هیچ سروری نیستید</h2>
        <p className="mt-2 text-sm leading-6 text-muted">یک سرور بسازید و دوستانتان را دعوت کنید، یا با لینک دعوت به سرور آن‌ها بپیوندید.</p>
        <button
          onClick={onAdd}
          className="btn-primary mt-6 px-6"
        >
          ساختن یا پیوستن
        </button>
        <button onClick={onDiscover} className="mt-3 inline-flex items-center gap-2 text-sm text-accent hover:underline">
          <Compass className="size-4" />
          کاوش سرورهای عمومی
        </button>
      </div>
    </div>
  );
}
