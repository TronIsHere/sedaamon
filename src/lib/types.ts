export type ChannelType = "text" | "voice";
export type Role = "owner" | "admin" | "member";

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
}

export interface ServerDTO {
  id: string;
  name: string;
  inviteCode: string;
  role: Role;
}

export interface ChannelDTO {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  position: number;
}

export interface MemberDTO {
  user: UserDTO;
  role: Role;
  /** While in the future, the member can read but not write. */
  mutedUntil: string | null;
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

export interface MessageDTO {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: UserDTO;
  replyTo: ReplyDTO | null;
  mentions: MentionDTO[];
  /** The whole server was pinged with "@everyone". */
  mentionEveryone: boolean;
  reactions: ReactionDTO[];
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

export interface ServerDetailDTO {
  server: ServerDTO;
  channels: ChannelDTO[];
  members: MemberDTO[];
  voice: VoiceStates;
  /** ids of members with an open connection right now */
  online: string[];
  /** Upcoming and just-started events. */
  events: EventDTO[];
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
