import { z } from "zod";
import { MUTED_FOREVER } from "@/lib/notify";
import type { NotifySettingDTO } from "@/lib/types";
import { assertId, handle, requireMember, requireMessageScope, requireUser } from "@/server/http";
import { NotifySetting } from "@/server/models";
import { emitToUsers } from "@/server/realtime";

const MAX_MUTE_MINUTES = 60 * 24 * 28;

const toSetting = (s: { target: unknown; scope: string; level?: string | null; mutedUntil?: Date | null }): NotifySettingDTO => ({
  target: String(s.target),
  scope: s.scope as NotifySettingDTO["scope"],
  level: (s.level ?? null) as NotifySettingDTO["level"],
  mutedUntil: s.mutedUntil ? s.mutedUntil.toISOString() : null,
});

/** Your notification choices for servers, channels and conversations. Places without one notify about every message. */
export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await NotifySetting.find({ user: user._id }).lean();
  return { settings: rows.map(toSetting) };
});

/**
 * Changes the choice for one server, channel or conversation. `level` null on a channel goes back to following the
 * server; `mute` is minutes, "forever" (until turned back on) or false to unmute. Fields left out stay as they are.
 */
export const PUT = handle(async (req) => {
  const user = await requireUser();
  const body = z
    .object({
      target: z.string(),
      scope: z.enum(["server", "channel"]),
      level: z.enum(["all", "mentions"]).nullable().optional(),
      mute: z.union([z.number().int().min(1).max(MAX_MUTE_MINUTES), z.literal("forever"), z.literal(false)]).optional(),
    })
    .parse(await req.json());
  assertId(body.target);
  if (body.scope === "server") await requireMember(body.target, user._id);
  else await requireMessageScope(body.target, user._id);

  const existing = await NotifySetting.findOne({ user: user._id, target: body.target }).lean();
  let level = body.level === undefined ? (existing?.level ?? null) : body.level;
  // A server's own default is every message, so saying so is the same as saying nothing.
  if (body.scope === "server" && level === "all") level = null;
  let mutedUntil = existing?.mutedUntil && existing.mutedUntil.getTime() > Date.now() ? existing.mutedUntil : null;
  if (body.mute === false) mutedUntil = null;
  else if (body.mute === "forever") mutedUntil = new Date(MUTED_FOREVER);
  else if (body.mute !== undefined) mutedUntil = new Date(Date.now() + body.mute * 60_000);

  let setting: NotifySettingDTO | null = null;
  if (level === null && mutedUntil === null) await NotifySetting.deleteOne({ user: user._id, target: body.target });
  else {
    const saved = await NotifySetting.findOneAndUpdate(
      { user: user._id, target: body.target },
      { scope: body.scope, level, mutedUntil },
      { upsert: true, returnDocument: "after" },
    ).lean();
    setting = toSetting(saved!);
  }
  // The person's other devices follow along.
  emitToUsers([String(user._id)], "notify:update", { target: body.target, setting });
  return { setting };
});
