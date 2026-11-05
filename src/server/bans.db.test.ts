import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { standingOf } from "@/lib/permissions";
import { banUser, isBanned, listBans, unbanUser } from "./bans";
import { Member, Server, ServerRole, User } from "./models";
import { joinServer } from "./servers";

// Like reads.db.test.ts: only against a throwaway database, which it drops.
const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("server bans", () => {
  const ids = { owner: new Types.ObjectId(), mod: new Types.ObjectId(), member: new Types.ObjectId(), server: new Types.ObjectId(), modRole: new Types.ObjectId() };
  const modRole = { id: String(ids.modRole), serverId: String(ids.server), name: "mod", color: "#38bdf8", permissions: ["member:moderate" as const], position: 1 };
  const modActor = { _id: ids.mod, standing: standingOf({ roles: [String(ids.modRole)] }, [modRole]) };
  const memberUser = { _id: ids.member, name: "Member", color: "#34d399", phone: "+989000000013" };

  beforeAll(async () => {
    // Test files run side by side, so each gets its own database.
    await mongoose.connect(uri!, { dbName: `${new URL(uri!).pathname.slice(1) || "sedaamon_test"}_bans` });
    await mongoose.connection.dropDatabase();
    await User.create([
      { _id: ids.owner, phone: "+989000000011", name: "Owner", color: "#38bdf8" },
      { _id: ids.mod, phone: "+989000000012", name: "Mod", color: "#a78bfa" },
      { _id: ids.member, phone: memberUser.phone, name: memberUser.name, color: memberUser.color },
    ]);
    await Server.create({ _id: ids.server, name: "S", owner: ids.owner, inviteCode: "ban-test" });
    await ServerRole.create({ _id: ids.modRole, server: ids.server, name: "mod", color: "#38bdf8", permissions: ["member:moderate"], position: 1 });
    await Member.create([
      { server: ids.server, user: ids.owner, owner: true },
      { server: ids.server, user: ids.mod, roles: [ids.modRole] },
      { server: ids.server, user: ids.member },
    ]);
  });

  afterAll(async () => {
    // Index builds run in the background and would recreate the database after it is dropped.
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("won't let a moderator ban someone at or above their rank, or themselves", async () => {
    await expect(banUser(String(ids.server), modActor, String(ids.owner), "")).rejects.toThrow();
    await expect(banUser(String(ids.server), modActor, String(ids.mod), "")).rejects.toThrow();
  });

  it("removes a banned member and keeps them out of the invite link", async () => {
    await banUser(String(ids.server), modActor, String(ids.member), "spam");
    expect(await Member.exists({ server: ids.server, user: ids.member })).toBeNull();
    expect(await isBanned(ids.server, ids.member)).toBe(true);
    await expect(joinServer("ban-test", memberUser)).rejects.toThrow("مسدود");

    const [ban] = await listBans(String(ids.server));
    expect(ban).toMatchObject({ reason: "spam", user: { id: String(ids.member) }, by: { id: String(ids.mod) } });
  });

  it("lets them back in by invite once unbanned", async () => {
    await unbanUser(String(ids.server), String(ids.member));
    await joinServer("ban-test", memberUser);
    expect(await Member.exists({ server: ids.server, user: ids.member })).not.toBeNull();
  });
});
