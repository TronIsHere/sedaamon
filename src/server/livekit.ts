import { AccessToken, RoomServiceClient, WebhookReceiver, type ParticipantInfo } from "livekit-server-sdk";
import { connectDB } from "./db";
import { Channel } from "./models";
import { realtime, setVoiceParticipant, clearVoiceChannel } from "./realtime";
import type { VoiceParticipant } from "@/lib/types";

const apiKey = () => process.env.LIVEKIT_API_KEY ?? "devkey";
const apiSecret = () => process.env.LIVEKIT_API_SECRET ?? "";
/** Address the Node server uses to reach LiveKit's HTTP API (same machine). */
const internalUrl = () => process.env.LIVEKIT_URL ?? "http://127.0.0.1:7880";
const isLoopback = (host: string) => host === "localhost" || host === "[::1]" || host.startsWith("127.");

/**
 * Address browsers use to reach LiveKit (wss://… behind nginx in production), as seen from this request.
 * A loopback address only works on the machine running the server, so a phone opening the app at
 * http://192.168.x.x:3000 is pointed at that same host instead. A page served over HTTPS may only open
 * wss:// sockets (Safari blocks ws:// there without a useful error), so the scheme follows the page.
 */
export function publicLiveKitUrl(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const pageHost = new URL(`http://${forwardedHost || req.headers.get("host") || "localhost"}`).hostname;
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = (forwardedProto ?? new URL(req.url).protocol.replace(":", "")) === "https";

  const configured = process.env.LIVEKIT_PUBLIC_URL;
  const url = new URL(configured || `ws://${pageHost}:7880`);
  if (isLoopback(url.hostname) && !isLoopback(pageHost)) url.hostname = pageHost;
  if (secure && url.protocol === "ws:") url.protocol = "wss:";
  if (!configured && process.env.NODE_ENV === "production") {
    console.warn("[livekit] LIVEKIT_PUBLIC_URL is not set; guessing", url.origin);
  }
  return url.origin + url.pathname.replace(/\/$/, "");
}

const ROOM_PREFIX = "ch_";
export const roomName = (channelId: string) => `${ROOM_PREFIX}${channelId}`;
const channelIdFromRoom = (room: string) => (room.startsWith(ROOM_PREFIX) ? room.slice(ROOM_PREFIX.length) : null);

export async function createVoiceToken(channelId: string, user: VoiceParticipant) {
  const at = new AccessToken(apiKey(), apiSecret(), {
    identity: user.id,
    name: user.name,
    metadata: JSON.stringify({ color: user.color, avatar: user.avatar ?? null }),
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
  let avatar: string | null = null;
  try {
    const meta = JSON.parse(p.metadata || "{}");
    color = meta.color ?? color;
    avatar = typeof meta.avatar === "string" ? meta.avatar : null;
  } catch {}
  return { id: p.identity, name: p.name || p.identity, color, avatar };
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

/** Disconnects everyone still in these channels' rooms, e.g. because the server was deleted. */
export async function closeVoiceRooms(channelIds: string[]) {
  if (!channelIds.length) return;
  const client = new RoomServiceClient(internalUrl(), apiKey(), apiSecret());
  await Promise.all(
    channelIds.map((id) =>
      client.deleteRoom(roomName(id)).catch(() => {
        // No such room just means nobody was connected.
      }),
    ),
  );
}
