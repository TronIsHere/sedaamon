import type { Types } from "mongoose";
import type { FriendState, FriendsDTO, ProfileDTO } from "@/lib/types";
import { assertId, HttpError } from "./http";
import { Conversation, Friendship, Member, Server, User } from "./models";
import { onlineAmong, isOnline, realtime, userRoom } from "./realtime";
import { toUser } from "./serialize";

const MAX_PENDING_OUTGOING = 50;

type Id = Types.ObjectId | string;

/** Servers both people belong to. Friend requests and profiles are only open to people who share one. */
export async function mutualServers(a: Id, b: Id) {
  const [mine, theirs] = await Promise.all([Member.find({ user: a }, { server: 1 }).lean(), Member.find({ user: b }, { server: 1 }).lean()]);
  const theirIds = new Set(theirs.map((m) => String(m.server)));
  const shared = mine.map((m) => m.server).filter((s) => theirIds.has(String(s)));
  return shared.length ? Server.find({ _id: { $in: shared } }, { name: 1 }).lean() : [];
}

const between = (a: Id, b: Id) => ({
  $or: [
    { requester: a, recipient: b },
    { requester: b, recipient: a },
  ],
});

export async function friendState(me: Id, other: Id): Promise<FriendState> {
  const row = await Friendship.findOne(between(me, other)).lean();
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return String(row.requester) === String(me) ? "outgoing" : "incoming";
}

/** Tell both people's open tabs to refetch their friend list. */
function notifyChanged(a: Id, b: Id) {
  realtime.io?.to([userRoom(String(a)), userRoom(String(b))]).emit("friends:changed");
}

export async function listFriends(me: Id): Promise<FriendsDTO> {
  const rows = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] }).sort({ updatedAt: -1 }).lean();
  const otherId = (r: (typeof rows)[number]) => (String(r.requester) === String(me) ? r.recipient : r.requester);
  const users = await User.find({ _id: { $in: rows.map(otherId) } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), toUser(u)]));
  const pick = (filter: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(filter).flatMap((r) => byId.get(String(otherId(r))) ?? []);

  const friends = pick((r) => r.status === "accepted");
  return {
    friends,
    incoming: pick((r) => r.status === "pending" && String(r.recipient) === String(me)),
    outgoing: pick((r) => r.status === "pending" && String(r.requester) === String(me)),
    online: onlineAmong(friends.map((f) => f.id)),
  };
}

export async function sendFriendRequest(me: Id, otherId: string) {
  assertId(otherId);
  if (String(me) === otherId) throw new HttpError(400, "نمی‌توانید به خودتان درخواست دوستی بدهید");
  const other = await User.findById(otherId, { _id: 1 }).lean();
  if (!other) throw new HttpError(404, "کاربر پیدا نشد");

  const existing = await Friendship.findOne(between(me, otherId));
  if (existing) {
    // They already asked me: asking back means accepting.
    if (existing.status === "pending" && String(existing.recipient) === String(me)) {
      existing.status = "accepted";
      await existing.save();
      notifyChanged(me, otherId);
    }
    return friendState(me, otherId);
  }

  if (!(await mutualServers(me, otherId)).length) throw new HttpError(403, "فقط به اعضای سرورهای مشترک می‌توانید درخواست دوستی بدهید");
  if ((await Friendship.countDocuments({ requester: me, status: "pending" })) >= MAX_PENDING_OUTGOING) {
    throw new HttpError(429, "درخواست‌های در انتظار شما زیاد است. کمی صبر کنید");
  }
  try {
    await Friendship.create({ requester: me, recipient: otherId });
  } catch (err) {
    // The same request arrived twice at once; the first one won.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  notifyChanged(me, otherId);
  return friendState(me, otherId);
}

export async function acceptFriendRequest(me: Id, otherId: string) {
  assertId(otherId);
  const row = await Friendship.findOneAndUpdate(
    { requester: otherId, recipient: me, status: "pending" },
    { status: "accepted" },
    { new: true },
  ).lean();
  if (!row) throw new HttpError(404, "درخواستی پیدا نشد");
  notifyChanged(me, otherId);
  return "friends" as const;
}

/** Cancel a request you sent, decline one you received, or unfriend. */
export async function removeFriendship(me: Id, otherId: string) {
  assertId(otherId);
  await Friendship.deleteOne(between(me, otherId));
  notifyChanged(me, otherId);
}

export async function getProfile(viewer: Id, targetId: string): Promise<ProfileDTO> {
  assertId(targetId);
  const target = await User.findById(targetId).lean();
  if (!target) throw new HttpError(404, "کاربر پیدا نشد");

  const self = String(viewer) === targetId;
  const shared = self ? [] : await mutualServers(viewer, targetId);
  const state: FriendState = self ? "none" : await friendState(viewer, targetId);
  // Profiles are not public: you need a server, a friendship or a conversation in common.
  if (!self && !shared.length && state === "none") {
    const talked = await Conversation.exists({ participants: { $all: [viewer, targetId] }, lastMessageAt: { $ne: null } });
    if (!talked) throw new HttpError(404, "کاربر پیدا نشد");
  }

  const online = isOnline(targetId);
  return {
    ...toUser(target),
    bio: target.bio ?? "",
    createdAt: target.createdAt.toISOString(),
    online,
    lastSeenAt: !online && target.lastSeenAt ? target.lastSeenAt.toISOString() : null,
    friendState: state,
    mutualServers: shared.map((s) => ({ id: String(s._id), name: s.name })),
  };
}
