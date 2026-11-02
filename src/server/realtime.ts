import type { Server as IOServer } from "socket.io";
import type { VoiceParticipant, VoiceStates } from "@/lib/types";

interface RealtimeState {
  io?: IOServer;
  /** channelId → (userId → participant) */
  voice: Map<string, Map<string, VoiceParticipant>>;
}

// server.ts (run by tsx) and Next's bundled route handlers load separate copies
// of this module, so the live state has to sit on globalThis to be shared.
const g = globalThis as unknown as { __sedaamonRealtime?: RealtimeState };
export const realtime: RealtimeState = (g.__sedaamonRealtime ??= { voice: new Map() });

export const serverRoom = (serverId: string) => `server:${serverId}`;
export const userRoom = (userId: string) => `user:${userId}`;

export function emitToServer(serverId: string, event: string, payload: unknown) {
  realtime.io?.to(serverRoom(serverId)).emit(event, payload);
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

function broadcastVoice(serverId: string, channelId: string) {
  const participants = [...(realtime.voice.get(channelId)?.values() ?? [])];
  emitToServer(serverId, "voice:state", { channelId, participants });
}
