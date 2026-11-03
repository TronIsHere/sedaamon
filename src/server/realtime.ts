import type { Server as IOServer } from "socket.io";
import type { VoiceParticipant, VoiceStates } from "@/lib/types";
import { channelAudienceById } from "./access";

interface RealtimeState {
  io?: IOServer;
  /** channelId → (userId → participant) */
  voice: Map<string, Map<string, VoiceParticipant>>;
  /** userId → number of open sockets (a user can have several tabs and devices) */
  connections: Map<string, number>;
  /** userId → timer that marks them offline once their last socket has stayed gone for a moment */
  offlineTimers: Map<string, ReturnType<typeof setTimeout>>;
}

// server.ts (run by tsx) and Next's bundled route handlers load separate copies
// of this module, so the live state has to sit on globalThis to be shared.
const g = globalThis as unknown as { __sedaamonRealtime?: RealtimeState };
export const realtime: RealtimeState = (g.__sedaamonRealtime ??= {
  voice: new Map(),
  connections: new Map(),
  offlineTimers: new Map(),
});

export const serverRoom = (serverId: string) => `server:${serverId}`;
export const userRoom = (userId: string) => `user:${userId}`;

/** Online while a socket is open, and for a few seconds after the last one closes (page reloads reconnect). */
export const isOnline = (userId: string) => (realtime.connections.get(userId) ?? 0) > 0 || realtime.offlineTimers.has(userId);

export const onlineAmong = (userIds: string[]) => userIds.filter(isOnline);

export function emitToServer(serverId: string, event: string, payload: unknown) {
  realtime.io?.to(serverRoom(serverId)).emit(event, payload);
}

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (userIds.length) realtime.io?.to(userIds.map(userRoom)).emit(event, payload);
}

/** Make every open socket of a user listen to a server's events (after joining or creating it). */
export function subscribeUserToServer(userId: string, serverId: string) {
  realtime.io?.in(userRoom(userId)).socketsJoin(serverRoom(serverId));
}

export function voiceSnapshot(channelIds: string[]): VoiceStates {
  const out: VoiceStates = {};
  for (const id of channelIds) {
    const people = realtime.voice.get(id);
    if (people?.size) out[id] = [...people.values()];
  }
  return out;
}

export function setVoiceParticipant(serverId: string, channelId: string, p: VoiceParticipant, present: boolean) {
  let people = realtime.voice.get(channelId);
  if (!people) realtime.voice.set(channelId, (people = new Map()));
  if (present) people.set(p.id, p);
  else people.delete(p.id);
  if (!people.size) realtime.voice.delete(channelId);
  broadcastVoice(serverId, channelId);
}

export function clearVoiceChannel(serverId: string, channelId: string) {
  realtime.voice.delete(channelId);
  broadcastVoice(serverId, channelId);
}

/** Sends to the whole server for a public channel, or only to those who may see a private one (`audience` is their ids). */
export function emitToAudience(serverId: string, audience: string[] | null, event: string, payload: unknown) {
  if (audience) emitToUsers(audience, event, payload);
  else emitToServer(serverId, event, payload);
}

function broadcastVoice(serverId: string, channelId: string) {
  // Who is in a private room is private too, so the audience is looked up first. If that fails nobody is told.
  channelAudienceById(channelId)
    .then((audience) => {
      // Read after the lookup so a burst of joins and leaves always ends on the latest state.
      const participants = [...(realtime.voice.get(channelId)?.values() ?? [])];
      emitToAudience(serverId, audience, "voice:state", { channelId, participants });
    })
    .catch((err) => console.error("[voice]", err));
}
