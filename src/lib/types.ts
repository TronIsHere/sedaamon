import type { Permission, Standing } from "./permissions";

export type ChannelType = "text" | "voice";

/** What a person chose to show next to their name. Whether they are connected is tracked separately. */
export type Status = "available" | "busy" | "away" | "gaming";

/** The `serverId` carried by direct-message events and used as their "server" in the UI. */
export const DM_SCOPE = "dm";

export interface UserDTO {
  id: string;
  name: string;
  color: string;
  /** URL of the uploaded picture, versioned so a change busts the cache. */
  avatar?: string | null;
  status?: Status;
  statusText?: string;
}

export interface MeDTO extends UserDTO {
  phone: string;
  bio: string;
  /** Whether this person can open the site's admin panel (/admin). */
  isAdmin?: boolean;
}

export interface ServerDTO {
  id: string;
  name: string;
  inviteCode: string;
  /** What the person asking may do here. */
  standing: Standing;
}

/** A role the server made: a name and colour, the permissions it grants, and how high it ranks (higher is stronger). */
export interface RoleDTO {
  id: string;
  serverId: string;
  name: string;
  color: string;
  permissions: Permission[];
  position: number;
}

/** A collapsible group of channels in the sidebar. */
export interface CategoryDTO {
  id: string;
  serverId: string;
  name: string;
  position: number;
}

export interface ChannelDTO {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  position: number;
  /** The category it sits in, or null for the channels above every category. */
  categoryId: string | null;
  /** A private channel is only seen by those who may view private channels, the roles and the people it lists. */
  isPrivate: boolean;
  /** Ids of roles let into a private channel, besides the ones that see every private channel. Empty for public ones. */
  allowedRoles: string[];
  /** Ids of members let into a private channel by name. Empty for public ones. */
  allowedMembers: string[];
}

/** Achievements shown next to a member (see lib/badges). */
export type BadgeId = "newcomer" | "rule_keeper" | "explorer";

export interface MemberDTO {
  user: UserDTO;
  owner: boolean;
  /** Ids of the roles they hold. */
  roles: string[];
  /** While in the future, the member can read but not write. */
  mutedUntil: string | null;
  joinedAt: string;
  badges: BadgeId[];
}

export interface ReactionDTO {
  emoji: string;
  users: string[];
}

/** What a reply points at. `deleted` is set when the original message no longer exists. */
export interface ReplyDTO {
  id: string;
  deleted: boolean;
  content: string;
  author: UserDTO | null;
}

/** Someone pinged by a message with "@name". */
export interface MentionDTO {
  id: string;
  name: string;
}

/** The "originally from" note on a forwarded message. */
export interface ForwardedDTO {
  /** Null once the author's account is gone; the name is still shown. */
  authorId: string | null;
  authorName: string;
  /** «سرور · #کانال», or «پیام مستقیم». */
  source: string;
}

export interface MessageDTO {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  forwardedFrom: ForwardedDTO | null;
  /** When the message was pinned to its channel, or null if it isn't. */
  pinnedAt: string | null;
  /** A built-in sticker id (see lib/stickers); `content` then holds the sticker's text. */
  sticker: string | null;
  author: UserDTO;
  replyTo: ReplyDTO | null;
  mentions: MentionDTO[];
  /** The whole server was pinged with "@everyone". */
  mentionEveryone: boolean;
  reactions: ReactionDTO[];
  attachments: AttachmentDTO[];
}

/**
 * A picture, voice note or file sent with a message. Pictures are shown inline (once tapped), voice notes play in
 * place (downloaded on first play), and anything else is a download.
 */
export interface AttachmentDTO {
  id: string;
  kind: "image" | "voice" | "file";
  name: string;
  contentType: string;
  size: number;
  url: string;
  /** Pictures only: their size in pixels, so the space is held before they load, and a tiny blurred stand-in. */
  width?: number;
  height?: number;
  preview?: string;
  /** Voice notes only: seconds, and loudness bars from 0 to 31. */
  duration?: number;
  waveform?: number[];
}

/** A message as pushed over the socket, which also says which server it belongs to. */
export interface LiveMessageDTO extends MessageDTO {
  serverId: string;
}

export interface MessageDeletedEvent {
  serverId: string;
  channelId: string;
  messageId: string;
}

export interface ReactionsEvent {
  serverId: string;
  channelId: string;
  messageId: string;
  reactions: ReactionDTO[];
}

/** A direct conversation with one other person. */
export interface DmDTO {
  id: string;
  peer: UserDTO;
  lastMessageAt: string | null;
}

export interface DmListDTO {
  conversations: DmDTO[];
  online: string[];
}

export interface EventDTO {
  id: string;
  serverId: string;
  title: string;
  description: string;
  startsAt: string;
  /** The voice channel people meet in, if the organiser picked one. */
  channelId: string | null;
  createdBy: UserDTO | null;
  /** Ids of members who said they will come. */
  interested: string[];
}

/** Sent when an event is about to begin ("soon") and when it does ("start"). */
export interface EventAlert {
  kind: "soon" | "start";
  event: EventDTO;
}

/** Why you were pinged: named in a message, reached by @everyone, or someone answered your message. */
export type NotificationKind = "mention" | "everyone" | "reply";

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  messageId: string;
  author: UserDTO;
  preview: string;
  createdAt: string;
  read: boolean;
}

export interface TypingEvent {
  channelId: string;
  user: UserDTO;
}

export interface PresenceEvent {
  userId: string;
  online: boolean;
}

export type VoiceParticipant = UserDTO;

/** channelId → people currently in that voice channel */
export type VoiceStates = Record<string, VoiceParticipant[]>;

/** How a server shows up in the public directory. */
export interface DiscoverySettingsDTO {
  isPublic: boolean;
  description: string;
  category: string;
  tags: string[];
}

/** One card of the public directory. */
export interface DiscoverServerDTO {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  memberCount: number;
  /** Whether the person asking is already inside. */
  joined: boolean;
}

export interface DiscoverDTO {
  servers: DiscoverServerDTO[];
  total: number;
  /** Servers per category among those matching the search (ignoring the chosen category), for the filter chips. */
  categories: Record<string, number>;
}

/** What a newcomer is shown on joining. */
export interface WelcomeDTO {
  enabled: boolean;
  title: string;
  message: string;
  rules: string[];
  requireRules: boolean;
  /** Channels to point newcomers at, in order. */
  channelIds: string[];
}

/** Where the person asking stands in the server's welcome flow. */
export interface OnboardingDTO {
  welcomePending: boolean;
  rulesPending: boolean;
}

export interface ServerDetailDTO {
  server: ServerDTO;
  /** Strongest first. */
  roles: RoleDTO[];
  categories: CategoryDTO[];
  channels: ChannelDTO[];
  members: MemberDTO[];
  voice: VoiceStates;
  /** ids of members with an open connection right now */
  online: string[];
  /** Upcoming and just-started events. */
  events: EventDTO[];
  discovery: DiscoverySettingsDTO;
  welcome: WelcomeDTO;
  onboarding: OnboardingDTO;
}

/** Where a message can be forwarded to: text channels the person can write in, and people they may message. */
export interface ForwardTargetsDTO {
  servers: { id: string; name: string; channels: { id: string; name: string }[] }[];
  people: UserDTO[];
}

export type FriendState = "none" | "friends" | "incoming" | "outgoing";

export interface FriendsDTO {
  friends: UserDTO[];
  /** People who asked to be your friend. */
  incoming: UserDTO[];
  /** People you asked. */
  outgoing: UserDTO[];
  online: string[];
}

export interface ProfileDTO extends UserDTO {
  bio: string;
  createdAt: string;
  online: boolean;
  lastSeenAt: string | null;
  friendState: FriendState;
  mutualServers: { id: string; name: string }[];
}

// ---- Admin panel ---------------------------------------------------------------------------------

export interface AdminStatsDTO {
  users: number;
  /** Signed up in the last 7 days. */
  newUsers: number;
  servers: number;
  publicServers: number;
  channels: number;
  voiceChannels: number;
  messages: number;
  /** Sent in the last 7 days. */
  messagesWeek: number;
  online: number;
  inVoice: number;
}

export interface AdminUserDTO {
  id: string;
  name: string;
  phone: string;
  color: string;
  avatar: string | null;
  bio: string;
  createdAt: string;
  lastSeenAt: string | null;
  online: boolean;
  servers: number;
  ownedServers: number;
  isAdmin: boolean;
}

export interface AdminServerDTO {
  id: string;
  name: string;
  inviteCode: string;
  isPublic: boolean;
  category: string;
  createdAt: string;
  owner: { id: string; name: string; phone: string } | null;
  members: number;
  channels: number;
}

export interface AdminChannelDTO {
  id: string;
  name: string;
  type: ChannelType;
  isPrivate: boolean;
  createdAt: string;
  server: { id: string; name: string };
  messages: number;
  inVoice: number;
}

export interface AdminMessageDTO {
  id: string;
  content: string;
  sticker: string | null;
  attachments: number;
  createdAt: string;
  author: { id: string; name: string; phone: string; color: string } | null;
  channel: { id: string; name: string };
  server: { id: string; name: string };
}
