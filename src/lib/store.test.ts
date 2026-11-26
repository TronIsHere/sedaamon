import { describe, expect, it } from "vitest";
import { canPostIn, skipsSlowmode, NO_STANDING, type Standing } from "./permissions";
import { STICKER_PACKS } from "./stickers";
import { backgroundClass, findItem, formatToman, frameClass, maxExtra, ownsStickerPack, POINTS_PACKAGES, STORE_ITEMS } from "./store";
import { SERVER_TEMPLATES } from "./templates";
import { paymentCard } from "@/server/store";

const member = (roles: string[] = [], permissions: Standing["permissions"] = []): Standing => ({ owner: false, roles, permissions, rank: 1 });

describe("canPostIn", () => {
  it("lets anyone write in an open channel", () => {
    expect(canPostIn({}, NO_STANDING)).toBe(true);
    expect(canPostIn({ posting: "everyone" }, NO_STANDING)).toBe(true);
  });

  it("keeps a limited channel to its roles and to channel managers", () => {
    const channel = { posting: "roles" as const, postRoles: ["teacher"] };
    expect(canPostIn(channel, member())).toBe(false);
    expect(canPostIn(channel, member(["teacher"]))).toBe(true);
    expect(canPostIn(channel, member([], ["channel:manage"]))).toBe(true);
    expect(canPostIn(channel, { ...NO_STANDING, owner: true })).toBe(true);
  });

  it("treats an announcement channel as limited even if posting says everyone", () => {
    expect(canPostIn({ announcement: true, posting: "everyone" }, member())).toBe(false);
  });
});

describe("skipsSlowmode", () => {
  it("spares moderators but not plain members", () => {
    expect(skipsSlowmode(member())).toBe(false);
    expect(skipsSlowmode(member([], ["member:moderate"]))).toBe(true);
  });
});

describe("templates", () => {
  it("only refer to roles they define, with names the API would accept", () => {
    for (const t of SERVER_TEMPLATES) {
      const keys = new Set((t.roles ?? []).map((r) => r.key));
      const channels = t.categories.flatMap((g) => g.channels);
      expect(channels.some((c) => c.type === "text" && !c.announcement && !c.postRoles), `${t.id} needs a channel everyone can write in`).toBe(true);
      for (const c of channels) {
        expect(c.name.length).toBeLessThanOrEqual(32);
        for (const key of c.postRoles ?? []) expect(keys.has(key), `${t.id}: ${key}`).toBe(true);
      }
    }
  });
});

describe("store", () => {
  it("keeps the extra on an order within 1% of the price", () => {
    for (const p of POINTS_PACKAGES) expect(maxExtra(p.price)).toBeLessThanOrEqual(Math.max(50, p.price / 100));
    expect(maxExtra(30_000)).toBe(300);
  });

  it("has a unique id and a look for every item", () => {
    expect(new Set(STORE_ITEMS.map((i) => i.id)).size).toBe(STORE_ITEMS.length);
    for (const i of STORE_ITEMS) {
      if (i.kind === "frame") expect(frameClass(i.id)).toMatch(/^frame-/);
      if (i.kind === "background") expect(backgroundClass(i.id)).toMatch(/^profile-bg-/);
    }
    expect(frameClass("frame:nope")).toBeUndefined();
    expect(findItem("stickers:gamer")?.kind).toBe("stickers");
  });

  it("gives free sticker packs to everyone and paid ones to their buyers", () => {
    const free = STICKER_PACKS.find((p) => !p.price)!;
    const paid = STICKER_PACKS.find((p) => p.price)!;
    expect(ownsStickerPack(free.id, [])).toBe(true);
    expect(ownsStickerPack(paid.id, [])).toBe(false);
    expect(ownsStickerPack(paid.id, [`stickers:${paid.id}`])).toBe(true);
  });

  it("formats toman with Persian digits", () => {
    expect(formatToman(30_025)).toBe("۳۰٬۰۲۵ تومان");
  });

  it("only offers card-to-card with a full card number and a name", () => {
    expect(paymentCard({})).toBeNull();
    expect(paymentCard({ STORE_CARD_NUMBER: "6219 8619 0357 547", STORE_CARD_HOLDER: "x" })).toBeNull();
    expect(paymentCard({ STORE_CARD_NUMBER: "6219-8619-0357-5479", STORE_CARD_HOLDER: " نام " })).toEqual({ number: "6219861903575479", holder: "نام" });
  });
});
