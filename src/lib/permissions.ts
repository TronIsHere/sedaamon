import type { Role } from "./types";

/** The owner can hand these out on top of "admin" and "member". Each one is a fixed bundle of GRANTS below. */
export const CUSTOM_ROLES = ["moderator", "organizer", "channel_manager"] as const satisfies readonly Role[];

/** Every role the owner can give to someone else, from the most to the least powerful. */
export const ASSIGNABLE_ROLES = ["admin", ...CUSTOM_ROLES, "member"] as const satisfies readonly Role[];

// Moderation only goes downwards, so the order here decides who can mute or remove whom.
export const ROLE_RANK: Record<Role, number> = { member: 0, organizer: 1, channel_manager: 1, moderator: 2, admin: 3, owner: 4 };

export const ROLE_LABEL: Record<Role, string> = {
  owner: "مالک سرور",
  admin: "مدیر",
  moderator: "ناظر",
  organizer: "برگزارکنندهٔ رویداد",
  channel_manager: "مدیر کانال",
  member: "عضو",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "همهٔ اختیارات",
  admin: "مدیریت سرور، کانال‌ها، اعضا و رویدادها",
  moderator: "حذف پیام، بی‌صدا کردن و اخراج اعضای پایین‌تر، سنجاق پیام",
  organizer: "زمان‌بندی رویدادها، سنجاق پیام و صدا زدن همه",
  channel_manager: "ساختن و ویرایش کانال‌ها و دیدن کانال‌های خصوصی",
  member: "بدون اختیار ویژه",
};

export type Permission =
  | "channel:manage" // create, rename and delete channels, and decide who a private channel is for
  | "channel:view_private" // see every private channel (whoever manages channels has to be able to see them)
  | "message:delete_any" // delete other people's messages
  | "member:moderate" // mute and kick members ranked below you
  | "role:assign" // promote and demote admins
  | "server:manage" // rename the server and renew its invite link
  | "server:own" // transfer or delete the server
  | "event:manage" // schedule, edit and cancel events
  | "message:mention_everyone" // ping the whole server with @everyone
  | "message:pin"; // pin and unpin messages in a channel

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: ["channel:manage", "channel:view_private", "message:delete_any", "member:moderate", "role:assign", "server:manage", "server:own", "event:manage", "message:mention_everyone", "message:pin"],
  admin: ["channel:manage", "channel:view_private", "message:delete_any", "member:moderate", "server:manage", "event:manage", "message:mention_everyone", "message:pin"],
  moderator: ["message:delete_any", "member:moderate", "message:pin"],
  organizer: ["event:manage", "message:mention_everyone", "message:pin"],
  channel_manager: ["channel:manage", "channel:view_private", "message:pin"],
  member: [],
};

export const can = (role: Role, permission: Permission) => GRANTS[role].includes(permission);

/** The part of a channel that decides who may see it. */
export interface ChannelAccess {
  isPrivate: boolean;
  allowedRoles: readonly string[];
  allowedMembers: readonly string[];
}

/** Public channels are for the whole server; private ones for those who see them all, their listed roles and listed people. */
export const canViewChannel = (channel: ChannelAccess, role: Role, userId: string) =>
  !channel.isPrivate || can(role, "channel:view_private") || channel.allowedRoles.includes(role) || channel.allowedMembers.includes(userId);

/** Moderation only ever goes downwards: you can act on someone strictly below your own role. */
export const outranks = (actor: Role, target: Role) => ROLE_RANK[actor] > ROLE_RANK[target];

export const canModerate = (actor: Role, target: Role) => can(actor, "member:moderate") && outranks(actor, target);

/** The emoji people can react with. A fixed set keeps the picker small and the data bounded. */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"] as const;

export const isMuted = (mutedUntil: string | null | undefined) => !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

/** Milliseconds until an ISO moment, negative once it has passed. */
export const msUntil = (iso: string) => new Date(iso).getTime() - Date.now();
