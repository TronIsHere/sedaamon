import crypto from "node:crypto";
import type { Types } from "mongoose";
import { CATEGORY_IDS, cleanTags, MAX_DESCRIPTION, MIN_DESCRIPTION } from "@/lib/discovery";
import { foldForSearch, matchesSearch } from "@/lib/search";
import type { DiscoverDTO, DiscoverySettingsDTO, MemberDTO, Role, ServerDetailDTO, ServerDTO, WelcomeDTO } from "@/lib/types";
import { memberCanView } from "./access";
import { listEvents } from "./events";
import { filesOfChannels, releaseFiles } from "./files";
import { announceJoin } from "./presence";
import { HttpError, requireMember } from "./http";
import { closeVoiceRooms } from "./livekit";
import { Channel, Event, Member, Message, Server, User } from "./models";
import { clearVoiceChannel, emitToServer, onlineAmong, realtime, serverRoom, subscribeUserToServer, voiceSnapshot } from "./realtime";
import { toChannel, toMember, toServer } from "./serialize";

const newInviteCode = () => crypto.randomBytes(6).toString("base64url");

export async function listServers(userId: Types.ObjectId): Promise<ServerDTO[]> {
  const memberships = await Member.find({ user: userId }).sort({ createdAt: 1 }).lean();
  const servers = await Server.find({ _id: { $in: memberships.map((m) => m.server) } }).lean();
  const byId = new Map(servers.map((s) => [String(s._id), s]));
  return memberships.flatMap((m) => {
    const s = byId.get(String(m.server));
    return s ? [toServer(s, m.role as Role)] : [];
  });
}

export async function getServerDetail(serverId: string, userId: Types.ObjectId): Promise<ServerDetailDTO> {
  const member = await requireMember(serverId, userId);
  const server = await Server.findById(serverId).lean();
  if (!server) throw new HttpError(404, "سرور پیدا نشد");

  const [allChannels, members, events] = await Promise.all([
    Channel.find({ server: serverId }).sort({ position: 1, createdAt: 1 }).lean(),
    Member.find({ server: serverId }).lean(),
    listEvents(serverId),
  ]);
  const channels = allChannels.filter((c) => memberCanView(c, member));
  const channelIds = new Set(channels.map((c) => String(c._id)));
  const users = await User.find({ _id: { $in: members.map((m) => m.user) } }).lean();
  const usersById = new Map(users.map((u) => [String(u._id), u]));

  return {
    server: toServer(server, member.role as Role),
    channels: channels.map(toChannel),
    members: members.flatMap((m): MemberDTO[] => {
      const u = usersById.get(String(m.user));
      return u ? [toMember(m, u)] : [];
    }),
    voice: voiceSnapshot(channels.filter((c) => c.type === "voice").map((c) => String(c._id))),
    online: onlineAmong(members.map((m) => String(m.user))),
    events,
    discovery: toDiscovery(server),
    // Only channels this person can see are pointed at, so a private starter room isn't revealed to those outside it.
    welcome: toWelcome(server, channelIds),
    onboarding: { welcomePending: !!member.welcomePending, rulesPending: !!member.rulesPending },
  };
}

type ServerDoc = NonNullable<Awaited<ReturnType<typeof findServerByInvite>>>;

const toDiscovery = (s: Pick<ServerDoc, "isPublic" | "description" | "category" | "tags">): DiscoverySettingsDTO => ({
  isPublic: !!s.isPublic,
  description: s.description ?? "",
  category: s.category ?? "other",
  tags: s.tags ?? [],
});

const toWelcome = (s: Pick<ServerDoc, "welcome">, visibleChannels?: Set<string>): WelcomeDTO => ({
  enabled: !!s.welcome?.enabled,
  title: s.welcome?.title ?? "",
  message: s.welcome?.message ?? "",
  rules: s.welcome?.rules ?? [],
  requireRules: !!s.welcome?.requireRules,
  channelIds: (s.welcome?.channels ?? []).map(String).filter((id) => !visibleChannels || visibleChannels.has(id)),
});

export async function createServer(name: string, ownerId: Types.ObjectId) {
  const server = await Server.create({ name, owner: ownerId, inviteCode: newInviteCode() });
  await Member.create({ server: server._id, user: ownerId, role: "owner", joinedVia: "owner" });
  await Channel.create([
    { server: server._id, name: "عمومی", type: "text", position: 0 },
    { server: server._id, name: "اتاق صوتی", type: "voice", position: 1 },
  ]);
  subscribeUserToServer(String(ownerId), String(server._id));
  return toServer(server, "owner");
}

export async function findServerByInvite(code: string) {
  return Server.findOne({ inviteCode: code.trim() }).lean();
}

type JoiningUser = { _id: Types.ObjectId; name: string; color: string; phone: string };

/** Adds the person to a server (or finds them already in it) and starts their welcome flow if the server has one. */
async function admit(server: ServerDoc, user: JoiningUser, via: "invite" | "discovery") {
  const existing = await Member.findOne({ server: server._id, user: user._id }).lean();
  if (existing) {
    subscribeUserToServer(String(user._id), String(server._id));
    return toServer(server, existing.role as Role);
  }

  const welcome = server.welcome;
  const welcomeOn = !!welcome?.enabled;
  const member = await Member.create({
    server: server._id,
    user: user._id,
    role: "member",
    joinedVia: via,
    welcomePending: welcomeOn,
    rulesPending: welcomeOn && !!welcome?.requireRules && !!welcome.rules.length,
  });
  // Private starter rooms (a "newcomers" room, say) are opened to each person who joins.
  if (welcomeOn && welcome?.channels.length) {
    await Channel.updateMany({ _id: { $in: welcome.channels }, server: server._id, isPrivate: true }, { $addToSet: { allowedMembers: user._id } });
  }

  emitToServer(String(server._id), "member:new", { serverId: String(server._id), member: toMember(member.toObject(), user) });
  subscribeUserToServer(String(user._id), String(server._id));
  announceJoin(String(server._id), String(user._id));
  return toServer(server, "member");
}

export async function joinServer(code: string, user: JoiningUser) {
  const server = await findServerByInvite(code);
  if (!server) throw new HttpError(404, "کد دعوت معتبر نیست");
  return admit(server, user, "invite");
}

/** Joining from the directory: only servers that chose to be listed can be entered without their invite link. */
export async function joinPublicServer(serverId: string, user: JoiningUser) {
  const server = await Server.findOne({ _id: serverId, isPublic: true }).lean();
  if (!server) throw new HttpError(404, "این سرور در فهرست عمومی نیست");
  return admit(server, user, "discovery");
}

const PAGE = 12;

/** The public directory: servers matching a search and category, most popular (or newest) first, one page at a time. */
export async function listDiscover(
  userId: Types.ObjectId,
  { q, category, sort, page }: { q: string; category: string; sort: "members" | "new"; page: number },
): Promise<DiscoverDTO> {
  // The directory is small enough to rank in memory; this bound keeps it that way if it ever isn't.
  const listed = await Server.find({ isPublic: true }).sort({ listedAt: -1 }).limit(500).lean();
  const counts = await Member.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { server: { $in: listed.map((s) => s._id) } } },
    { $group: { _id: "$server", n: { $sum: 1 } } },
  ]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.n]));

  const query = foldForSearch(q.trim().replace(/^#+/, ""));
  const matching = listed.filter((s) => matchesSearch(`${s.name} ${s.description} ${(s.tags ?? []).join(" ")}`, query));
  const categories: Record<string, number> = {};
  for (const s of matching) categories[s.category ?? "other"] = (categories[s.category ?? "other"] ?? 0) + 1;

  const inCategory = category ? matching.filter((s) => (s.category ?? "other") === category) : matching;
  if (sort === "members") inCategory.sort((a, b) => (countOf.get(String(b._id)) ?? 0) - (countOf.get(String(a._id)) ?? 0));
  const shown = inCategory.slice(page * PAGE, (page + 1) * PAGE);

  const mine = await Member.find({ user: userId, server: { $in: shown.map((s) => s._id) } }, { server: 1 }).lean();
  const joined = new Set(mine.map((m) => String(m.server)));
  return {
    servers: shown.map((s) => ({
      id: String(s._id),
      name: s.name,
      description: s.description ?? "",
      category: s.category ?? "other",
      tags: s.tags ?? [],
      memberCount: countOf.get(String(s._id)) ?? 0,
      joined: joined.has(String(s._id)),
    })),
    total: inCategory.length,
    categories,
  };
}

/** Lists the server in the directory, or takes it out. A listing needs a real description and a category. */
export async function updateDiscovery(serverId: string, input: { isPublic: boolean; description: string; category: string; tags: string[] }) {
  const description = input.description.trim().slice(0, MAX_DESCRIPTION);
  if (input.isPublic && description.length < MIN_DESCRIPTION) throw new HttpError(400, "برای نمایش در فهرست عمومی، توضیح سرور را بنویسید (دست‌کم ۱۰ حرف)");
  if (!(CATEGORY_IDS as string[]).includes(input.category)) throw new HttpError(400, "دسته‌بندی معتبر نیست");

  const current = await Server.findById(serverId, { isPublic: 1, listedAt: 1 }).lean();
  if (!current) throw new HttpError(404, "سرور پیدا نشد");
  await Server.updateOne(
    { _id: serverId },
    { isPublic: input.isPublic, description, category: input.category, tags: cleanTags(input.tags), listedAt: input.isPublic ? (current.isPublic && current.listedAt ? current.listedAt : new Date()) : null },
  );
}

export interface WelcomeInput {
  enabled: boolean;
  title: string;
  message: string;
  rules: string[];
  requireRules: boolean;
  channelIds: string[];
}

/** Saves the welcome screen. Turning it (or the rules requirement) off frees everyone who was still waiting on it. */
export async function updateWelcome(serverId: string, input: WelcomeInput) {
  const rules = input.rules.map((r) => r.trim()).filter(Boolean);
  if (input.enabled && input.requireRules && !rules.length) throw new HttpError(400, "برای الزام پذیرش قوانین، دست‌کم یک قانون بنویسید");

  const wanted = [...new Set(input.channelIds)];
  const channels = wanted.length ? await Channel.find({ _id: { $in: wanted }, server: serverId }, { _id: 1 }).lean() : [];
  const valid = new Set(channels.map((c) => String(c._id)));

  await Server.updateOne(
    { _id: serverId },
    {
      welcome: {
        enabled: input.enabled,
        title: input.title.trim(),
        message: input.message.trim(),
        rules,
        requireRules: input.requireRules,
        channels: wanted.filter((id) => valid.has(id)),
      },
    },
  );

  const requiresRules = input.enabled && input.requireRules && rules.length > 0;
  if (!input.enabled) await Member.updateMany({ server: serverId, $or: [{ welcomePending: true }, { rulesPending: true }] }, { welcomePending: false, rulesPending: false });
  else if (!requiresRules) await Member.updateMany({ server: serverId, rulesPending: true }, { rulesPending: false });
  // Anyone looking at the server fetches it again: pending states and starter channels may have changed.
  emitToServer(serverId, "welcome:changed", { serverId });
}

/** Ends a newcomer's welcome flow. If the rules were accepted, that is remembered (and earns the badge). */
export async function acceptWelcome(serverId: string, userId: Types.ObjectId, acceptRules: boolean) {
  const [server, member] = await Promise.all([Server.findById(serverId, { welcome: 1 }).lean(), Member.findOne({ server: serverId, user: userId })]);
  if (!server || !member) throw new HttpError(404, "سرور پیدا نشد");

  const hasRules = !!server.welcome?.enabled && !!server.welcome.rules.length;
  if (member.rulesPending && !acceptRules) throw new HttpError(400, "برای ادامه باید قوانین را بپذیرید");

  member.welcomePending = false;
  member.rulesPending = false;
  if (hasRules && acceptRules) member.rulesAcceptedAt = new Date();
  await member.save();

  const user = await User.findById(userId).lean();
  emitToServer(serverId, "member:update", { serverId, member: toMember(member.toObject(), user!) });
}

/** Tell everyone in the server that its name or invite link changed. */
function broadcastServer(server: { _id: Types.ObjectId; name: string; inviteCode: string }) {
  emitToServer(String(server._id), "server:update", { id: String(server._id), name: server.name, inviteCode: server.inviteCode });
}

export async function renameServer(serverId: string, name: string) {
  const server = await Server.findByIdAndUpdate(serverId, { name }, { new: true }).lean();
  if (!server) throw new HttpError(404, "سرور پیدا نشد");
  broadcastServer(server);
  return server;
}

/** The old link stops working at once; people already inside are unaffected. */
export async function renewInvite(serverId: string) {
  const server = await Server.findByIdAndUpdate(serverId, { inviteCode: newInviteCode() }, { new: true }).lean();
  if (!server) throw new HttpError(404, "سرور پیدا نشد");
  broadcastServer(server);
  return server;
}

/** The owner becomes an admin and the chosen member takes over. */
export async function transferOwnership(serverId: string, currentOwner: Types.ObjectId, newOwnerId: string) {
  const target = await Member.findOne({ server: serverId, user: newOwnerId });
  if (!target) throw new HttpError(404, "این کاربر عضو سرور نیست");
  if (String(target.user) === String(currentOwner)) throw new HttpError(400, "شما همین الان مالک سرور هستید");

  // The server's own record is the source of truth; roles follow it.
  const claimed = await Server.updateOne({ _id: serverId, owner: currentOwner }, { owner: target.user });
  if (!claimed.modifiedCount) throw new HttpError(409, "مالکیت سرور تغییر کرده است. صفحه را تازه کنید");

  target.role = "owner";
  target.mutedUntil = null;
  await target.save();
  const previous = await Member.findOneAndUpdate({ server: serverId, user: currentOwner }, { role: "admin" }, { new: true });

  const users = await User.find({ _id: { $in: [target.user, currentOwner] } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  for (const m of [target, previous]) {
    const user = m && byId.get(String(m.user));
    if (m && user) emitToServer(serverId, "member:update", { serverId, member: toMember(m, user) });
  }
  return toMember(target, byId.get(String(target.user))!);
}

/** Removes the server and everything in it, and sends every member's open screens back to their other servers. */
export async function deleteServer(serverId: string) {
  const channels = await Channel.find({ server: serverId }, { _id: 1, type: 1 }).lean();
  const channelIds = channels.map((c) => c._id);

  // Tell people first: once the members are gone there is no one left to address.
  const room = realtime.io?.in(serverRoom(serverId));
  room?.emit("server:removed", { serverId, kicked: false, deleted: true });
  room?.socketsLeave(serverRoom(serverId));

  const voiceIds = channels.filter((c) => c.type === "voice").map((c) => String(c._id));
  for (const id of voiceIds) clearVoiceChannel(serverId, id);
  await closeVoiceRooms(voiceIds);

  const files = await filesOfChannels(channelIds);
  await Promise.all([
    Message.deleteMany({ channel: { $in: channelIds } }),
    Channel.deleteMany({ server: serverId }),
    Member.deleteMany({ server: serverId }),
    Event.deleteMany({ server: serverId }),
  ]);
  await Server.deleteOne({ _id: serverId });
  void releaseFiles(files);
}
