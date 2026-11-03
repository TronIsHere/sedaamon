import type { PresenceEvent, UserDTO } from "@/lib/types";
import { Conversation, Friendship, Member, User } from "./models";
import { isOnline, realtime, serverRoom, userRoom } from "./realtime";

/** A reload or a rename (which reconnects the socket) shouldn't flash the user as offline. */
const OFFLINE_GRACE_MS = 5000;

/** Everyone who can see this user's status: the servers they are in, their friends and people they talk to directly. */
async function audienceRooms(userId: string) {
  const [memberships, friendships, conversations] = await Promise.all([
    Member.find({ user: userId }, { server: 1 }).lean(),
    Friendship.find({ status: "accepted", $or: [{ requester: userId }, { recipient: userId }] }).lean(),
    Conversation.find({ participants: userId, lastMessageAt: { $ne: null } }, { participants: 1 }).lean(),
  ]);
  const peers = new Set([
    ...friendships.map((f) => (String(f.requester) === userId ? String(f.recipient) : String(f.requester))),
    ...conversations.flatMap((c) => c.participants.map(String).filter((p) => p !== userId)),
  ]);
  return [...memberships.map((m) => serverRoom(String(m.server))), ...[...peers].map(userRoom)];
}

/**
 * Pushes a changed name, picture or status to everyone who can see this person, and to their own other tabs.
 * Open sockets also carry the name for typing indicators, so those are refreshed too.
 */
export async function emitUserUpdate(user: UserDTO) {
  try {
    const rooms = [userRoom(user.id), ...(await audienceRooms(user.id))];
    realtime.io?.to(rooms).emit("user:update", user);
    for (const socket of (await realtime.io?.in(userRoom(user.id)).fetchSockets()) ?? []) {
      socket.data.user = { id: user.id, name: user.name, color: user.color, avatar: user.avatar };
    }
  } catch (err) {
    console.error("[user update]", err);
  }
}

async function broadcast(userId: string, online: boolean) {
  try {
    const rooms = await audienceRooms(userId);
    if (rooms.length) realtime.io?.to(rooms).emit("presence", { userId, online } satisfies PresenceEvent);
  } catch (err) {
    console.error("[presence]", err);
  }
}

export function userConnected(userId: string) {
  const wasOnline = isOnline(userId);
  const pending = realtime.offlineTimers.get(userId);
  if (pending) {
    clearTimeout(pending);
    realtime.offlineTimers.delete(userId);
  }
  realtime.connections.set(userId, (realtime.connections.get(userId) ?? 0) + 1);
  if (!wasOnline) void broadcast(userId, true);
}

export function userDisconnected(userId: string) {
  const left = (realtime.connections.get(userId) ?? 1) - 1;
  if (left > 0) {
    realtime.connections.set(userId, left);
    return;
  }
  realtime.connections.delete(userId);
  if (realtime.offlineTimers.has(userId)) return;
  realtime.offlineTimers.set(
    userId,
    setTimeout(async () => {
      realtime.offlineTimers.delete(userId);
      if (isOnline(userId)) return;
      await User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => {});
      void broadcast(userId, false);
    }, OFFLINE_GRACE_MS),
  );
}

/** Tell a server's members that someone who is already connected has just joined it. */
export function announceJoin(serverId: string, userId: string) {
  if (isOnline(userId)) realtime.io?.to(serverRoom(serverId)).emit("presence", { userId, online: true } satisfies PresenceEvent);
}
