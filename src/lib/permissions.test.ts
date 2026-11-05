import { describe, expect, it } from "vitest";
import { can, canManageRole, canModerate, canViewChannel, isMuted, NO_STANDING, outranks, standingOf, topRole, type ChannelAccess } from "./permissions";
import type { RoleDTO } from "./types";

const role = (id: string, position: number, permissions: RoleDTO["permissions"] = []): RoleDTO => ({
  id,
  serverId: "s1",
  name: id,
  color: "#38bdf8",
  permissions,
  position,
});

const admin = role("admin", 3, ["member:moderate", "role:manage", "channel:view_private", "message:delete_any"]);
const mod = role("mod", 2, ["member:moderate"]);
const helper = role("helper", 1, ["message:pin"]);
const roles = [admin, mod, helper];

const ownerStanding = standingOf({ owner: true, roles: [] }, roles);
const adminStanding = standingOf({ roles: ["admin"] }, roles);
const modStanding = standingOf({ roles: ["mod"] }, roles);
const helperStanding = standingOf({ roles: ["helper"] }, roles);
const member = standingOf({ roles: [] }, roles);

describe("standingOf", () => {
  it("ranks by the highest role held and merges every role's permissions", () => {
    const s = standingOf({ roles: ["helper", "mod"] }, roles);
    expect(s.rank).toBe(2);
    expect(s.permissions.sort()).toEqual(["member:moderate", "message:pin"]);
    expect(s.roles.sort()).toEqual(["helper", "mod"]);
  });

  it("ignores roles that no longer exist", () => {
    const s = standingOf({ roles: ["deleted", "helper"] }, roles);
    expect(s.roles).toEqual(["helper"]);
    expect(s.rank).toBe(1);
  });

  it("puts a member without roles at rank 0 and the owner above every role", () => {
    expect(member.rank).toBe(0);
    expect(ownerStanding.rank).toBeGreaterThan(admin.position);
  });
});

describe("can", () => {
  it("lets the owner do everything, including what no role grants", () => {
    expect(can(ownerStanding, "server:own")).toBe(true);
    expect(can(ownerStanding, "event:manage")).toBe(true);
  });

  it("allows only what a member's roles grant", () => {
    expect(can(modStanding, "member:moderate")).toBe(true);
    expect(can(modStanding, "role:manage")).toBe(false);
    expect(can(NO_STANDING, "message:pin")).toBe(false);
  });
});

describe("canViewChannel", () => {
  const open: ChannelAccess = { isPrivate: false, allowedRoles: [], allowedMembers: [] };
  const secret: ChannelAccess = { isPrivate: true, allowedRoles: ["helper"], allowedMembers: ["u-guest"] };

  it("shows public channels to everyone", () => {
    expect(canViewChannel(open, NO_STANDING, "anyone")).toBe(true);
  });

  it("shows a private channel to its roles, its listed people, and whoever sees every private channel", () => {
    expect(canViewChannel(secret, helperStanding, "u1")).toBe(true);
    expect(canViewChannel(secret, member, "u-guest")).toBe(true);
    expect(canViewChannel(secret, adminStanding, "u2")).toBe(true);
    expect(canViewChannel(secret, ownerStanding, "u3")).toBe(true);
  });

  it("hides a private channel from everyone else, even moderators", () => {
    expect(canViewChannel(secret, member, "u4")).toBe(false);
    expect(canViewChannel(secret, modStanding, "u5")).toBe(false);
  });
});

describe("moderation goes only downwards", () => {
  it("lets a moderator act on those strictly below them", () => {
    expect(canModerate(modStanding, helperStanding)).toBe(true);
    expect(canModerate(modStanding, member)).toBe(true);
  });

  it("never on equals or those above", () => {
    expect(canModerate(modStanding, modStanding)).toBe(false);
    expect(canModerate(modStanding, adminStanding)).toBe(false);
    expect(canModerate(adminStanding, ownerStanding)).toBe(false);
  });

  it("needs the permission as well as the rank", () => {
    expect(outranks(helperStanding, member)).toBe(true);
    expect(canModerate(helperStanding, member)).toBe(false);
  });

  it("lets the owner moderate anyone else", () => {
    expect(canModerate(ownerStanding, adminStanding)).toBe(true);
  });
});

describe("canManageRole", () => {
  it("allows role managers only below their own rank", () => {
    expect(canManageRole(adminStanding, mod)).toBe(true);
    expect(canManageRole(adminStanding, admin)).toBe(false);
    expect(canManageRole(modStanding, helper)).toBe(false);
  });

  it("lets the owner manage every role", () => {
    expect(canManageRole(ownerStanding, admin)).toBe(true);
  });
});

describe("topRole", () => {
  it("picks the highest role held", () => {
    expect(topRole({ roles: ["helper", "admin"] }, roles)?.id).toBe("admin");
    expect(topRole({ roles: [] }, roles)).toBeUndefined();
  });
});

describe("isMuted", () => {
  it("is true only until the moment passes", () => {
    expect(isMuted(new Date(Date.now() + 60_000).toISOString())).toBe(true);
    expect(isMuted(new Date(Date.now() - 60_000).toISOString())).toBe(false);
    expect(isMuted(null)).toBe(false);
  });
});
