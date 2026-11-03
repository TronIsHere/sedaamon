"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, MessageCircle, Server, UserCheck, UserMinus, UserPlus, UserX, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate, formatLastSeen } from "@/lib/format";
import { ASSIGNABLE_ROLES, can, canModerate, isMuted, ROLE_HINT, ROLE_LABEL } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import { statusLabel } from "@/lib/status";
import { getSocket } from "@/lib/socket";
import type { FriendState, MemberDTO, ProfileDTO, Role } from "@/lib/types";
import Select from "@/components/ui/select";
import Avatar from "./Avatar";
import { BadgeShelf } from "./Badges";
import { Modal } from "./Dialogs";
import { RolePill } from "./RoleBadge";

const MUTE_OPTIONS = [
  { minutes: 10, label: "۱۰ دقیقه" },
  { minutes: 60, label: "۱ ساعت" },
  { minutes: 60 * 24, label: "۱ روز" },
  { minutes: 60 * 24 * 7, label: "۱ هفته" },
];

const buttonClass =
  "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60";

/** A person's profile: who they are, whether they are online, friendship actions and, inside a server, moderation. */
export default function ProfileCard({
  userId,
  serverId,
  myRole,
  member,
  online,
  onClose,
  onNotify,
  onFriendsChanged,
  onMessage,
}: {
  userId: string;
  /** The server this was opened from, when it was opened from a member list or a message. */
  serverId?: string;
  myRole?: Role;
  /** This person's membership in that server. */
  member?: MemberDTO;
  online: boolean;
  onClose: () => void;
  onNotify: (message: string) => void;
  onFriendsChanged: () => void;
  /** Opens a direct conversation with this person. */
  onMessage: (userId: string) => void;
}) {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"kick" | "unfriend" | null>(null);
  const [muteMinutes, setMuteMinutes] = useState(MUTE_OPTIONS[1].minutes);

  const load = useCallback(
    () =>
      api<{ profile: ProfileDTO }>(`/api/users/${userId}`)
        .then((res) => setProfile(res.profile))
        .catch((err) => setError(err.message)),
    [userId],
  );

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on("friends:changed", load);
    return () => {
      socket.off("friends:changed", load);
    };
  }, [load]);

  const run = async (action: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    try {
      await action();
      done?.();
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const setFriend = (friendState: FriendState) => setProfile((p) => p && { ...p, friendState });
  const friendAction = (action: () => Promise<{ friendState: FriendState }>) =>
    run(async () => {
      setFriend((await action()).friendState);
      onFriendsChanged();
    });

  const memberPath = `/api/servers/${serverId}/members/${userId}`;
  const showRoleControl = !!(member && myRole && can(myRole, "role:assign") && member.role !== "owner");
  const showModeration = !!(member && myRole && canModerate(myRole, member.role));
  const muted = isMuted(member?.mutedUntil);

  return (
    <Modal title="پروفایل" onClose={onClose}>
      {!profile ? (
        error ? (
          <p className="py-8 text-center text-sm text-danger">{error}</p>
        ) : (
          <div className="grid place-items-center py-12 text-muted">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-line">
            <Avatar user={profile} size="lg" online={online} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">{profile.name}</p>
              {member && member.role !== "member" && (
                <div className="mt-1">
                  <RolePill role={member.role} />
                </div>
              )}
              {(profile.status || profile.statusText) && online && (
                <p dir="auto" className="mt-1 truncate text-sm text-accent">
                  {profile.statusText || statusLabel(profile.status)}
                </p>
              )}
              <p className={cn("mt-1 flex items-center gap-1.5 text-sm", online ? "text-online" : "text-muted")}>
                {online ? (
                  "آنلاین"
                ) : profile.lastSeenAt ? (
                  <>
                    <Clock className="size-3.5" />
                    آخرین بازدید {formatLastSeen(profile.lastSeenAt)}
                  </>
                ) : (
                  "آفلاین"
                )}
              </p>
            </div>
          </div>

          {profile.bio && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-muted">درباره من</h3>
              <p dir="auto" className="bidi-lines rounded-xl bg-ink-850 px-4 py-3 text-sm leading-7 whitespace-pre-wrap break-words ring-1 ring-line">
                {profile.bio}
              </p>
            </section>
          )}

          {member && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-muted">نشان‌ها در این سرور</h3>
              <BadgeShelf earned={member.badges} />
            </section>
          )}

          <section className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div>
              <h3 className="mb-0.5 text-xs font-semibold text-muted">عضو صدامون از</h3>
              <p>{formatDate(profile.createdAt)}</p>
            </div>
            {member?.mutedUntil && muted && (
              <div>
                <h3 className="mb-0.5 text-xs font-semibold text-muted">وضعیت در سرور</h3>
                <p className="text-amber-300">بی‌صدا شده</p>
              </div>
            )}
          </section>

          {profile.mutualServers.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold text-muted">
                سرورهای مشترک ({toPersianDigits(profile.mutualServers.length)})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.mutualServers.map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5 rounded-full bg-ink-850 px-3 py-1 text-xs ring-1 ring-line">
                    <Server className="size-3 text-accent" />
                    {s.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2 border-t border-line pt-4">
            <button
              onClick={() => onMessage(userId)}
              className={cn(buttonClass, "bg-accent-strong text-on-accent hover:bg-accent")}
            >
              <MessageCircle className="size-4" />
              ارسال پیام
            </button>
            {profile.friendState === "none" && (
              <button
                disabled={busy}
                onClick={() => friendAction(() => api("/api/friends", { body: { userId } }))}
                className={cn(buttonClass, "bg-ink-800 hover:bg-ink-700")}
              >
                <UserPlus className="size-4" />
                افزودن به دوستان
              </button>
            )}
            {profile.friendState === "outgoing" && (
              <button
                disabled={busy}
                onClick={() => friendAction(() => api(`/api/friends/${userId}`, { method: "DELETE" }))}
                className={cn(buttonClass, "bg-ink-800 text-muted hover:text-fg")}
              >
                <UserX className="size-4" />
                درخواست ارسال شد · لغو
              </button>
            )}
            {profile.friendState === "incoming" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={busy}
                  onClick={() => friendAction(() => api(`/api/friends/${userId}`, { method: "PATCH" }))}
                  className={cn(buttonClass, "bg-accent-strong text-on-accent hover:bg-accent")}
                >
                  <UserCheck className="size-4" />
                  پذیرفتن
                </button>
                <button
                  disabled={busy}
                  onClick={() => friendAction(() => api(`/api/friends/${userId}`, { method: "DELETE" }))}
                  className={cn(buttonClass, "bg-ink-800 text-muted hover:text-fg")}
                >
                  رد کردن
                </button>
              </div>
            )}
            {profile.friendState === "friends" &&
              (confirm === "unfriend" ? (
                <ConfirmRow
                  label="این فرد از دوستانتان حذف شود؟"
                  action="حذف"
                  busy={busy}
                  onConfirm={() => friendAction(() => api(`/api/friends/${userId}`, { method: "DELETE" }))}
                  onCancel={() => setConfirm(null)}
                />
              ) : (
                <button
                  onClick={() => setConfirm("unfriend")}
                  className={cn(buttonClass, "bg-online/10 text-online hover:bg-danger/10 hover:text-danger")}
                >
                  <UserCheck className="size-4" />
                  دوست شما هستند
                </button>
              ))}
          </section>

          {(showRoleControl || showModeration) && serverId && (
            <section className="space-y-2 border-t border-line pt-4">
              <h3 className="text-xs font-semibold text-muted">مدیریت عضو</h3>

              {showRoleControl && member && (
                <label className="block space-y-1.5">
                  <span className="text-sm text-muted">نقش در سرور</span>
                  <Select
                    disabled={busy}
                    value={member.role}
                    onChange={(e) => run(() => api(memberPath, { method: "PATCH", body: { role: e.target.value } }))}
                    className="text-sm"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <span className="block text-xs leading-5 text-muted">{ROLE_HINT[member.role]}</span>
                </label>
              )}

              {showModeration && (
                <>
                  {muted ? (
                    <button
                      disabled={busy}
                      onClick={() => run(() => api(memberPath, { method: "PATCH", body: { muteMinutes: null } }))}
                      className={cn(buttonClass, "bg-ink-800 hover:bg-ink-700")}
                    >
                      <Volume2 className="size-4" />
                      رفع بی‌صدایی
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <Select
                        value={muteMinutes}
                        onChange={(e) => setMuteMinutes(Number(e.target.value))}
                        aria-label="مدت بی‌صدایی"
                        className="text-sm"
                      >
                        {MUTE_OPTIONS.map((o) => (
                          <option key={o.minutes} value={o.minutes}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(() => api(memberPath, { method: "PATCH", body: { muteMinutes } }), () => onNotify("عضو بی‌صدا شد"))
                        }
                        className={cn(buttonClass, "flex-1 bg-ink-800 hover:bg-ink-700")}
                      >
                        <VolumeX className="size-4" />
                        بی‌صدا کردن
                      </button>
                    </div>
                  )}

                  {confirm === "kick" ? (
                    <ConfirmRow
                      label={`${profile.name} از سرور اخراج شود؟`}
                      action="اخراج"
                      busy={busy}
                      onConfirm={() => run(() => api(memberPath, { method: "DELETE" }), onClose)}
                      onCancel={() => setConfirm(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setConfirm("kick")}
                      className={cn(buttonClass, "text-danger hover:bg-danger/10")}
                    >
                      <UserMinus className="size-4" />
                      اخراج از سرور
                    </button>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function ConfirmRow({
  label,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  label: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl bg-danger/10 p-3">
      <p className="mb-2 text-sm">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={onConfirm} className={cn(buttonClass, "bg-danger-strong text-white hover:bg-danger-strong/90")}>
          {action}
        </button>
        <button onClick={onCancel} className={cn(buttonClass, "bg-ink-800 text-muted hover:text-fg")}>
          انصراف
        </button>
      </div>
    </div>
  );
}
