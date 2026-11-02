import { AccessToken, RoomServiceClient, WebhookReceiver, type ParticipantInfo } from "livekit-server-sdk";
import { connectDB } from "./db";
import { Channel } from "./models";
import { realtime, setVoiceParticipant, clearVoiceChannel } from "./realtime";
import type { VoiceParticipant } from "@/lib/types";

const apiKey = () => process.env.LIVEKIT_API_KEY ?? "devkey";
const apiSecret = () => process.env.LIVEKIT_API_SECRET ?? "";
/** Address the Node server uses to reach LiveKit's HTTP API (same machine). */
const internalUrl = () => process.env.LIVEKIT_URL ?? "http://127.0.0.1:7880";
/** Address browsers use to reach LiveKit (wss://… behind nginx in production). */
export const publicLiveKitUrl = () => process.env.LIVEKIT_PUBLIC_URL ?? "ws://localhost:7880";

const ROOM_PREFIX = "ch_";
export const roomName = (channelId: string) => `${ROOM_PREFIX}${channelId}`;
const channelIdFromRoom = (room: string) => (room.startsWith(ROOM_PREFIX) ? room.slice(ROOM_PREFIX.length) : null);

export async function createVoiceToken(channelId: string, user: VoiceParticipant) {
  const at = new AccessToken(apiKey(), apiSecret(), {
    identity: user.id,
    name: user.name,
    metadata: JSON.stringify({ color: user.color }),
    ttl: "6h",
  });
  at.addGrant({
    room: roomName(channelId),
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}

function toParticipant(p: ParticipantInfo): VoiceParticipant {
  let color = "#64748b";
  try {
    color = JSON.parse(p.metadata || "{}").color ?? color;
  } catch {}
  return { id: p.identity, name: p.name || p.identity, color };
}

const serverOfChannel = new Map<string, string>();
async function lookupServer(channelId: string) {
  const cached = serverOfChannel.get(channelId);
  if (cached) return cached;
  await connectDB();
  const channel = await Channel.findById(channelId, { server: 1 }).lean();
  if (!channel) return null;
  serverOfChannel.set(channelId, String(channel.server));
  return String(channel.server);
}

/** Applies a LiveKit webhook to the voice presence map. Throws if the signature is invalid. */
export async function handleLiveKitWebhook(body: string, authHeader: string | null) {
  const event = await new WebhookReceiver(apiKey(), apiSecret()).receive(body, authHeader ?? undefined);
  const channelId = event.room && channelIdFromRoom(event.room.name);
  if (!channelId) return;
  const serverId = await lookupServer(channelId);
  if (!serverId) return;

  if (event.event === "participant_joined" && event.participant) {
    setVoiceParticipant(serverId, channelId, toParticipant(event.participant), true);
  } else if (event.event === "participant_left" && event.participant) {
    setVoiceParticipant(serverId, channelId, toParticipant(event.participant), false);
  } else if (event.event === "room_finished") {
    clearVoiceChannel(serverId, channelId);
  }
}

/** Rebuilds the presence map from LiveKit, e.g. after the Node process restarts. */
export async function syncVoiceFromLiveKit() {
  const client = new RoomServiceClient(internalUrl(), apiKey(), apiSecret());
  const rooms = await client.listRooms();
  realtime.voice.clear();
  for (const room of rooms) {
    const channelId = channelIdFromRoom(room.name);
    if (!channelId) continue;
    const people = await client.listParticipants(room.name);
    if (!people.length) continue;
    realtime.voice.set(channelId, new Map(people.map((p) => [p.identity, toParticipant(p)])));
  }
}
