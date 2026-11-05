import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DM_SCOPE } from "@/lib/types";
import { Channel, Conversation, Member, Message, Notification, Server, User } from "./models";
import { listReadStates, markChannelRead, markServerRead } from "./reads";

// Runs against a real MongoDB, and drops the whole database afterwards, so it only runs when pointed at a throwaway one:
// TEST_MONGODB_URI=mongodb://127.0.0.1:27017/sedaamon_test npm test
const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("read markers", () => {
  const ids = {
    a: new Types.ObjectId(),
    b: new Types.ObjectId(),
    server: new Types.ObjectId(),
    general: new Types.ObjectId(),
    secret: new Types.ObjectId(),
    dm: new Types.ObjectId(),
  };
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  const post = (channel: Types.ObjectId, author: Types.ObjectId, content = "hi") => Message.create({ channel, author, content });
  const stateOf = async (user: Types.ObjectId, channel: Types.ObjectId) =>
    (await listReadStates(user)).find((r) => r.channelId === String(channel));

  beforeAll(async () => {
    // Test files run side by side, so each gets its own database.
    await mongoose.connect(uri!, { dbName: `${new URL(uri!).pathname.slice(1) || "sedaamon_test"}_reads` });
    await mongoose.connection.dropDatabase();
    await User.create([
      { _id: ids.a, phone: "+989000000001", name: "A", color: "#38bdf8" },
      { _id: ids.b, phone: "+989000000002", name: "B", color: "#a78bfa" },
    ]);
    await Server.create({ _id: ids.server, name: "S", owner: ids.b, inviteCode: "test-invite" });
    await Member.create([
      { server: ids.server, user: ids.a, createdAt: hourAgo },
      { server: ids.server, user: ids.b, owner: true, createdAt: hourAgo },
    ]);
    await Channel.create([
      { _id: ids.general, server: ids.server, name: "general", type: "text", createdAt: hourAgo },
      { _id: ids.secret, server: ids.server, name: "secret", type: "text", isPrivate: true, allowedMembers: [ids.b], createdAt: hourAgo },
    ]);
    await Conversation.create({ _id: ids.dm, key: "a:b", participants: [ids.a, ids.b], lastMessageAt: new Date() });
    await post(ids.general, ids.b, "before markers existed");
    await post(ids.secret, ids.b);
  });

  afterAll(async () => {
    // Index builds run in the background and would recreate the database after it is dropped.
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("takes everything already there as read the first time, and leaves out channels you can't see", async () => {
    const reads = await listReadStates(ids.a);
    expect(reads.map((r) => r.channelId).sort()).toEqual([String(ids.general), String(ids.dm)].sort());
    expect(reads.every((r) => r.count === 0)).toBe(true);
    expect(reads.find((r) => r.channelId === String(ids.dm))?.serverId).toBe(DM_SCOPE);
  });

  it("counts other people's messages after the marker, not your own, and keeps counting after a reload", async () => {
    await post(ids.general, ids.b);
    await post(ids.general, ids.b);
    await post(ids.general, ids.a);
    expect((await stateOf(ids.a, ids.general))?.count).toBe(2);
    expect((await stateOf(ids.a, ids.general))?.count).toBe(2);
  });

  it("clears the count and the pings up to the marker when the channel is read", async () => {
    const pinging = await post(ids.general, ids.b, "@A look");
    await Notification.create({
      user: ids.a,
      kind: "mention",
      message: pinging._id,
      channel: ids.general,
      server: ids.server,
      author: ids.b,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { lastRead } = await markChannelRead(ids.a, String(ids.general));
    expect(lastRead).toBe(String(pinging._id));
    expect((await stateOf(ids.a, ids.general))?.count).toBe(0);
    expect(await Notification.countDocuments({ user: ids.a, readAt: null })).toBe(0);
  });

  it("never moves a marker backwards", async () => {
    const newest = await post(ids.general, ids.b);
    await markChannelRead(ids.a, String(ids.general));
    const older = await Message.findOne({ channel: ids.general }).sort({ _id: 1 }).lean();
    await markChannelRead(ids.a, String(ids.general), String(older!._id));
    expect((await stateOf(ids.a, ids.general))?.lastRead).toBe(String(newest._id));
  });

  it("refuses a message from another channel", async () => {
    const elsewhere = await post(ids.secret, ids.b);
    await expect(markChannelRead(ids.a, String(ids.general), String(elsewhere._id))).rejects.toThrow();
  });

  it("counts a channel made later from its creation, and marks the whole server read at once", async () => {
    const fresh = await Channel.create({ server: ids.server, name: "new", type: "text" });
    await post(fresh._id, ids.b);
    await post(ids.general, ids.b);
    await post(ids.dm, ids.b);
    expect((await stateOf(ids.a, fresh._id))?.count).toBe(1);

    await markServerRead(ids.a, String(ids.server));
    expect((await stateOf(ids.a, fresh._id))?.count).toBe(0);
    expect((await stateOf(ids.a, ids.general))?.count).toBe(0);
    // A conversation isn't part of any server.
    expect((await stateOf(ids.a, ids.dm))?.count).toBe(1);
  });
});
