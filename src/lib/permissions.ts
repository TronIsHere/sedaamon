import type { Role } from "./types";

export const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

export const ROLE_LABEL: Record<Role, string> = { owner: "مالک سرور", admin: "مدیر", member: "عضو" };

export type Permission =
  | "channel:manage" // create, rename and delete channels
  | "message:delete_any" // delete other people's messages
  | "member:moderate" // mute and kick members ranked below you
  | "role:assign" // promote and demote admins
  | "server:manage" // rename the server and renew its invite link
  | "server:own" // transfer or delete the server
  | "event:manage"; // schedule, edit and cancel events

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: ["channel:manage", "message:delete_any", "member:moderate", "role:assign", "server:manage", "server:own", "event:manage"],
  admin: ["channel:manage", "message:delete_any", "member:moderate", "server:manage", "event:manage"],
  member: [],
};

export const can = (role: Role, permission: Permission) => GRANTS[role].includes(permission);

/** Moderation only ever goes downwards: you can act on someone strictly below your own role. */
export const outranks = (actor: Role, target: Role) => ROLE_RANK[actor] > ROLE_RANK[target];

export const canModerate = (actor: Role, target: Role) => can(actor, "member:moderate") && outranks(actor, target);

/** The emoji people can react with. A fixed set keeps the picker small and the data bounded. */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"] as const;

export const isMuted = (mutedUntil: string | null | undefined) => !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

/** Milliseconds until an ISO moment, negative once it has passed. */
export const msUntil = (iso: string) => new Date(iso).getTime() - Date.now();
