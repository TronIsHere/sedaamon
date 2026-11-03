"use client";

import { useRef, useState, type FormEvent } from "react";
import { Camera, Download, Hash, Loader2, Lock, LogOut, Trash2, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { resizeToAvatar } from "@/lib/image";
import { can, CUSTOM_ROLES, ROLE_LABEL } from "@/lib/permissions";
import { useCloseOnBack, useInstallPrompt } from "@/lib/mobile";
import { toPersianDigits } from "@/lib/phone";
import { STATUSES } from "@/lib/status";
import { getSocket } from "@/lib/socket";
import type { ChannelDTO, ChannelType, MeDTO, MemberDTO, Role, ServerDTO, Status } from "@/lib/types";
import Avatar from "./Avatar";

export const inputClass =
  "field";

/** Centered on larger screens, a bottom sheet on phones. */
export function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Room for lists and cards. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  useCloseOnBack(true, onClose);
  return (
    <div className="animate-fade-in fixed inset-0 z-40 flex items-end justify-center bg-ink-950/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "animate-sheet-in sm:animate-pop-in max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-ink-900 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgb(0_0_0/0.5)] max-sm:border-b-0 sm:rounded-3xl sm:pt-5 sm:pb-5 sm:shadow-[var(--shadow-float)]",
          wide ? "max-w-2xl" : "max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink-600 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="بستن" className="-m-1 grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-ink-800 hover:text-fg sm:m-0 sm:size-9">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useSubmit<T>(action: () => Promise<T>, onDone: (result: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onDone(await action());
    } catch (err) {
      setError((err as Error).message);
    }
    // Forms that stay open after saving must be usable again.
    setBusy(false);
  };
  return { busy, error, submit };
}

export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      disabled={busy || disabled}
      className="btn-primary w-full"
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ServerDialog({ onClose, onDone }: { onClose: () => void; onDone: (s: ServerDTO) => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [value, setValue] = useState("");
  const { busy, error, submit } = useSubmit(
    () =>
      mode === "create"
        ? api<{ server: ServerDTO }>("/api/servers", { body: { name: value } })
        : api<{ server: ServerDTO }>("/api/servers/join", { body: { code: value } }),
    (res) => onDone(res.server),
  );

  return (
    <Modal title={mode === "create" ? "ساختن سرور" : "پیوستن به سرور"} onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-ink-850 p-1 text-sm">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setValue("");
            }}
            className={cn("rounded-full py-2 sm:py-1.5", mode === m ? "bg-accent-strong text-on-accent" : "text-muted hover:text-fg")}
          >
            {m === "create" ? "سرور جدید" : "با لینک دعوت"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">{mode === "create" ? "نام سرور" : "لینک یا کد دعوت"}</span>
          <input
            className={inputClass}
            dir={mode === "join" ? "ltr" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={mode === "create" ? 40 : 200}
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!value.trim()}>
          {mode === "create" ? "ساختن" : "پیوستن"}
        </SubmitButton>
      </form>
    </Modal>
  );
}

/** Who a channel is for. Public by default; private ones list the roles and people let in. */
interface ChannelAccessValue {
  isPrivate: boolean;
  allowedRoles: Role[];
  allowedMembers: string[];
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

const sameAccess = (a: ChannelAccessValue, b: ChannelAccessValue) =>
  a.isPrivate === b.isPrivate &&
  (!a.isPrivate || (JSON.stringify([...a.allowedRoles].sort()) === JSON.stringify([...b.allowedRoles].sort()) && JSON.stringify([...a.allowedMembers].sort()) === JSON.stringify([...b.allowedMembers].sort())));

function ChannelAccessFields({ value, members, onChange }: { value: ChannelAccessValue; members: MemberDTO[]; onChange: (v: ChannelAccessValue) => void }) {
  // Whoever sees every private channel is let in anyway, so listing them would only be noise.
  const roles = CUSTOM_ROLES.filter((r) => !can(r, "channel:view_private"));
  const people = members.filter((m) => !can(m.role, "channel:view_private"));
  return (
    <div className="space-y-3">
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
          value.isPrivate ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
        )}
      >
        <input type="checkbox" className="sr-only" checked={value.isPrivate} onChange={(e) => onChange({ ...value, isPrivate: e.target.checked })} />
        <Lock className="size-5 text-muted" />
        <div>
          <p className="font-semibold">کانال خصوصی</p>
          <p className="text-xs text-muted">فقط مالک، مدیران، مدیران کانال و کسانی که انتخاب می‌کنید آن را می‌بینند</p>
        </div>
      </label>

      {value.isPrivate && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-sm text-muted">نقش‌هایی که وارد می‌شوند</legend>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <label
                  key={r}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-sm",
                    value.allowedRoles.includes(r) ? "border-accent bg-accent-strong/10" : "border-line text-muted hover:bg-ink-800",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={value.allowedRoles.includes(r)} onChange={() => onChange({ ...value, allowedRoles: toggle(value.allowedRoles, r) })} />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm text-muted">
              اعضایی که وارد می‌شوند
              {value.allowedMembers.length > 0 && <span className="ms-1 text-xs">({toPersianDigits(value.allowedMembers.length)})</span>}
            </legend>
            <ul className="scrollbar-thin max-h-44 space-y-0.5 overflow-y-auto rounded-xl bg-ink-850 p-1.5 ring-1 ring-line">
              {people.map((m) => (
                <li key={m.user.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink-850">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent-strong)]"
                      checked={value.allowedMembers.includes(m.user.id)}
                      onChange={() => onChange({ ...value, allowedMembers: toggle(value.allowedMembers, m.user.id) })}
                    />
                    <Avatar user={m.user} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{m.user.name}</span>
                  </label>
                </li>
              ))}
              {!people.length && <li className="px-2 py-3 text-center text-sm text-muted">عضو دیگری در سرور نیست</li>}
            </ul>
          </fieldset>
        </>
      )}
    </div>
  );
}

export function CreateChannelDialog({
  serverId,
  members,
  type: initialType,
  onClose,
  onDone,
}: {
  serverId: string;
  members: MemberDTO[];
  type: ChannelType;
  onClose: () => void;
  onDone: (c: ChannelDTO) => void;
}) {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<ChannelAccessValue>({ isPrivate: false, allowedRoles: [], allowedMembers: [] });
  const { busy, error, submit } = useSubmit(
    () => api<{ channel: ChannelDTO }>(`/api/servers/${serverId}/channels`, { body: { name, type, ...access } }),
    (res) => onDone(res.channel),
  );

  return (
    <Modal title="ساختن کانال" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          {(["text", "voice"] as const).map((t) => (
            <label
              key={t}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
                type === t ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
              )}
            >
              <input type="radio" className="sr-only" checked={type === t} onChange={() => setType(t)} />
              {t === "text" ? <Hash className="size-5 text-muted" /> : <Volume2 className="size-5 text-muted" />}
              <div>
                <p className="font-semibold">{t === "text" ? "متنی" : "صوتی"}</p>
                <p className="text-xs text-muted">
                  {t === "text" ? "پیام، لینک و گفت‌وگوی نوشتاری" : "گفت‌وگوی صوتی، تصویر و اشتراک صفحه"}
                </p>
              </div>
            </label>
          ))}
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نام کانال</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus />
        </label>
        <ChannelAccessFields value={access} members={members} onChange={setAccess} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!name.trim()}>
          ساختن کانال
        </SubmitButton>
      </form>
    </Modal>
  );
}

export function ProfileDialog({
  me,
  onClose,
  onDone,
  onMeChange,
  onNotify,
}: {
  me: MeDTO;
  onClose: () => void;
  onDone: (me: MeDTO) => void;
  /** The picture changed; the dialog stays open. */
  onMeChange: (me: MeDTO) => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio);
  const [status, setStatus] = useState<Status>(me.status ?? "available");
  const [statusText, setStatusText] = useState(me.statusText ?? "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { canPrompt, iosManual, install } = useInstallPrompt();
  const nameChanged = name.trim() !== me.name;
  const dirty =
    nameChanged || bio.trim() !== me.bio || status !== (me.status ?? "available") || statusText.trim() !== (me.statusText ?? "");
  const { busy, error, submit } = useSubmit(
    () => api<{ user: MeDTO }>("/api/me", { method: "PATCH", body: { name, bio, status, statusText } }),
    (res) => {
      // Reconnect so others see the new name on typing indicators.
      if (nameChanged) getSocket().disconnect().connect();
      onDone(res.user);
    },
  );

  const changePhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const body = await resizeToAvatar(file);
      const res = await fetch("/api/me/avatar", { method: "POST", body, headers: { "Content-Type": body.type } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "بارگذاری تصویر ممکن نشد");
      onMeChange(data.user);
    } catch (err) {
      onNotify(err instanceof DOMException ? "این فایل تصویر معتبری نیست" : (err as Error).message);
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      onMeChange((await api<{ user: MeDTO }>("/api/me/avatar", { method: "DELETE" })).user);
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const installApp = () => {
    if (canPrompt) install();
    else onNotify("برای نصب: در Safari دکمهٔ Share را بزنید و Add to Home Screen را انتخاب کنید");
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  };

  return (
    <Modal title="حساب کاربری" onClose={onClose}>
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-line">
        <div className="relative">
          <Avatar user={{ name: name || me.name, color: me.color, avatar: me.avatar }} size="lg" />
          {photoBusy && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60">
              <Loader2 className="size-6 animate-spin" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{name.trim() || me.name}</p>
          <p className="mt-0.5 text-sm text-muted" dir="ltr">
            {toPersianDigits(me.phone)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => changePhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={photoBusy}
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1.5 text-xs font-semibold hover:bg-ink-700 disabled:opacity-60"
            >
              <Camera className="size-3.5" />
              {me.avatar ? "تغییر تصویر" : "افزودن تصویر"}
            </button>
            {me.avatar && (
              <button
                type="button"
                disabled={photoBusy}
                onClick={removePhoto}
                className="rounded-full px-3 py-1.5 text-xs text-muted hover:text-danger disabled:opacity-60"
              >
                حذف
              </button>
            )}
          </div>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نامی که دیگران می‌بینند</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
        </label>
        <div className="space-y-1.5">
          <span className="text-sm text-muted">وضعیت</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="وضعیت">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={status === s.value}
                onClick={() => setStatus(s.value)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                  status === s.value ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
                )}
              >
                <span className={cn("size-2.5 rounded-full", s.dot)} />
                {s.label}
              </button>
            ))}
          </div>
          <input
            className={inputClass}
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            maxLength={60}
            placeholder="متن وضعیت، مثلاً «در حال بازی Dota 2»"
            aria-label="متن وضعیت"
          />
        </div>
        <label className="block space-y-1.5">
          <span className="flex justify-between text-sm text-muted">
            درباره من
            <span className="text-xs">{toPersianDigits(bio.length)}/{toPersianDigits(190)}</span>
          </span>
          <textarea
            className={cn(inputClass, "field-sizing-content max-h-40 min-h-20 resize-none leading-7")}
            dir="auto"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            placeholder="چند کلمه دربارهٔ خودتان بنویسید"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={name.trim().length < 2 || !dirty}>
          ذخیره
        </SubmitButton>
      </form>
      <div className="mt-5 space-y-1 border-t border-line pt-4">
        {(canPrompt || iosManual) && (
          <button
            onClick={installApp}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-accent hover:bg-ink-800"
          >
            <Download className="size-4" />
            نصب برنامه روی این دستگاه
          </button>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10"
        >
          <LogOut className="size-4" />
          خروج از حساب
        </button>
      </div>
    </Modal>
  );
}

export function EditChannelDialog({
  channel,
  members,
  onClose,
  onNotify,
}: {
  channel: ChannelDTO;
  members: MemberDTO[];
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(channel.name);
  const saved: ChannelAccessValue = { isPrivate: channel.isPrivate, allowedRoles: channel.allowedRoles, allowedMembers: channel.allowedMembers };
  const [access, setAccess] = useState<ChannelAccessValue>(saved);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The server broadcasts the rename and the deletion, which updates every open screen including this one.
  const { busy, error, submit } = useSubmit(
    () => api(`/api/channels/${channel.id}`, { method: "PATCH", body: { name, ...access } }),
    onClose,
  );

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/api/channels/${channel.id}`, { method: "DELETE" });
      onClose();
    } catch (err) {
      onNotify((err as Error).message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Modal title="تنظیمات کانال" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نام کانال</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus />
        </label>
        <ChannelAccessFields value={access} members={members} onChange={setAccess} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!name.trim() || (name.trim() === channel.name && sameAccess(access, saved))}>
          ذخیره
        </SubmitButton>
      </form>
      <div className="mt-5 border-t border-line pt-4">
        {confirmDelete ? (
          <div className="rounded-xl bg-danger/10 p-3">
            <p className="mb-2 text-sm leading-6">
              کانال {channel.type === "text" ? "#" : ""}
              {channel.name} {channel.type === "text" && "با همهٔ پیام‌هایش "}حذف شود؟ این کار برگشت‌پذیر نیست.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={remove}
                disabled={deleting}
                className="rounded-xl bg-danger-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-danger-strong/90 disabled:opacity-60"
              >
                حذف کانال
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted hover:text-fg">
                انصراف
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="size-4" />
            حذف کانال
          </button>
        )}
      </div>
    </Modal>
  );
}
