export type ChannelType = "text" | "voice";
export type Role = "owner" | "member";

export interface UserDTO {
  id: string;
  name: string;
  color: string;
}

export interface MeDTO extends UserDTO {
  phone: string;
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
}

export interface MessageDTO {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  author: UserDTO;
}

/** A message as pushed over the socket, which also says which server it belongs to. */
export interface LiveMessageDTO extends MessageDTO {
  serverId: string;
}

export interface TypingEvent {
  channelId: string;
  user: UserDTO;
}

export type VoiceParticipant = UserDTO;

/** channelId → people currently in that voice channel */
export type VoiceStates = Record<string, VoiceParticipant[]>;

export interface ServerDetailDTO {
  server: ServerDTO;
  channels: ChannelDTO[];
  members: MemberDTO[];
  voice: VoiceStates;
}
