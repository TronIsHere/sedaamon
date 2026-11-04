import type { MemberDTO, RoleDTO } from "./types";

export type Permission =
  | "channel:manage" // create, rename and delete channels and categories, and decide who a private channel is for
  | "channel:view_private" // see every private channel (whoever manages channels has to be able to see them)
  | "message:delete_any" // delete other people's messages
  | "member:moderate" // mute and kick members ranked below you
  | "role:manage" // create, edit and hand out the roles below your own
  | "server:manage" // rename the server and renew its invite link
  | "server:own" // transfer or delete the server; only ever the owner's, never part of a role
  | "event:manage" // schedule, edit and cancel events
  | "message:mention_everyone" // ping the whole server with @everyone
  | "message:pin"; // pin and unpin messages in a channel

/** The switches a role can have, in the order the role editor lists them. */
export const ROLE_PERMISSIONS = [
  "server:manage",
  "role:manage",
  "channel:manage",
  "channel:view_private",
  "member:moderate",
  "message:delete_any",
  "message:pin",
  "message:mention_everyone",
  "event:manage",
] as const satisfies readonly Permission[];

export type RolePermission = (typeof ROLE_PERMISSIONS)[number];

export const PERMISSION_INFO: Record<RolePermission, { label: string; hint: string }> = {
  "server:manage": { label: "مدیریت سرور", hint: "تغییر نام، لینک دعوت، فهرست عمومی و خوش‌آمدگویی" },
  "role:manage": { label: "مدیریت نقش‌ها", hint: "ساختن و ویرایش نقش‌های پایین‌تر و دادن آن‌ها به اعضا" },
  "channel:manage": { label: "مدیریت کانال‌ها", hint: "ساختن، ویرایش و حذف کانال‌ها و دسته‌ها" },
  "channel:view_private": { label: "دیدن کانال‌های خصوصی", hint: "ورود به همهٔ کانال‌های خصوصی" },
  "member:moderate": { label: "بی‌صدا کردن و اخراج", hint: "فقط برای اعضای پایین‌تر" },
  "message:delete_any": { label: "حذف پیام دیگران", hint: "فقط پیام اعضای پایین‌تر" },
  "message:pin": { label: "سنجاق پیام", hint: "سنجاق کردن و برداشتن پیام‌ها" },
  "message:mention_everyone": { label: "صدا زدن همه", hint: "فرستادن ‎@everyone" },
  "event:manage": { label: "مدیریت رویدادها", hint: "زمان‌بندی، ویرایش و لغو رویدادها" },
};

/** Colours a role can take: bright enough to read as a name on the dark background. */
export const ROLE_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#f472b6", "#60a5fa", "#a3e635", "#fb923c", "#94a3b8"] as const;

export const OWNER_LABEL = "مالک سرور";

/**
 * Where someone stands in a server: what they may do and how high they rank. Rank is the position of their highest
 * role (0 with none); the owner ranks above every role. JSON has no Infinity, so the owner's rank is just very large.
 */
export interface Standing {
  owner: boolean;
  /** Ids of the roles they hold. */
  roles: string[];
  permissions: Permission[];
  rank: number;
}

const OWNER_RANK = 1_000_000;

export const NO_STANDING: Standing = { owner: false, roles: [], permissions: [], rank: 0 };

/** Works out a standing from the roles someone holds. Ids of roles that no longer exist are ignored. */
export function standingOf(member: { owner?: boolean | null; roles?: readonly string[] | null }, roles: readonly Pick<RoleDTO, "id" | "permissions" | "position">[]): Standing {
  const held = roles.filter((r) => member.roles?.includes(r.id));
  return {
    owner: !!member.owner,
    roles: held.map((r) => r.id),
    permissions: [...new Set(held.flatMap((r) => r.permissions))],
    rank: member.owner ? OWNER_RANK : Math.max(0, ...held.map((r) => r.position)),
  };
}

/** The owner may do everything; everyone else what their roles together allow. */
export const can = (s: Pick<Standing, "owner" | "permissions">, permission: Permission) => s.owner || s.permissions.includes(permission);

/** The part of a channel that decides who may see it. */
export interface ChannelAccess {
  isPrivate: boolean;
  allowedRoles: readonly string[];
  allowedMembers: readonly string[];
}

/** Public channels are for the whole server; private ones for those who see them all, their listed roles and listed people. */
export const canViewChannel = (channel: ChannelAccess, s: Standing, userId: string) =>
  !channel.isPrivate || can(s, "channel:view_private") || channel.allowedRoles.some((r) => s.roles.includes(r)) || channel.allowedMembers.includes(userId);

/** Moderation only ever goes downwards: you can act on someone strictly below your highest role. */
export const outranks = (actor: Standing, target: Standing) => actor.rank > target.rank;

export const canModerate = (actor: Standing, target: Standing) => can(actor, "member:moderate") && outranks(actor, target);

/** A role can be edited, deleted and handed out by the owner, and by those who manage roles and sit above it. */
export const canManageRole = (actor: Standing, role: Pick<RoleDTO, "position">) => actor.owner || (can(actor, "role:manage") && role.position < actor.rank);

/** The highest of someone's roles, which gives them their colour and their title. */
export function topRole(member: Pick<MemberDTO, "roles">, roles: readonly RoleDTO[]): RoleDTO | undefined {
  let top: RoleDTO | undefined;
  for (const r of roles) if (member.roles.includes(r.id) && (!top || r.position > top.position)) top = r;
  return top;
}

/** The emoji people can react with. A fixed set keeps the picker small and the data bounded. */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"] as const;

export const isMuted = (mutedUntil: string | null | undefined) => !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

/** Milliseconds until an ISO moment, negative once it has passed. */
export const msUntil = (iso: string) => new Date(iso).getTime() - Date.now();
