"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Camera, Clapperboard, Download, Gamepad2, Hash, House, Loader2, Lock, LogOut, Megaphone, PenOff, School, Sparkles, Trash2, Users, Volume2, X } from "lucide-react";
import { SERVER_TEMPLATES, type ServerTemplate } from "@/lib/templates";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { PICTURE_HINT, resizeToAvatar } from "@/lib/image";
import { can, SLOWMODE_STEPS, standingOf } from "@/lib/permissions";
import { useCloseOnBack, useInstallPrompt } from "@/lib/mobile";
import { toPersianDigits } from "@/lib/phone";
import { getSocket } from "@/lib/socket";
import type { CategoryDTO, ChannelDTO, ChannelType, MeDTO, MemberDTO, RoleDTO, ServerDTO } from "@/lib/types";
import Select from "@/components/ui/select";
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

export function ServerDialog({ invite, onClose, onDone }: { invite?: string; onClose: () => void; onDone: (s: ServerDTO) => void }) {
  const [mode, setMode] = useState<"create" | "join">(invite ? "join" : "create");
  const [value, setValue] = useState(invite ?? "");
  const [templateId, setTemplateId] = useState(SERVER_TEMPLATES[0].id);
  const template = SERVER_TEMPLATES.find((t) => t.id === templateId) ?? SERVER_TEMPLATES[0];
  const { busy, error, submit } = useSubmit(
    () =>
      mode === "create"
        ? api<{ server: ServerDTO }>("/api/servers", { body: { name: value, template: templateId } })
        : api<{ server: ServerDTO }>("/api/servers/join", { body: { code: value } }),
    (res) => onDone(res.server),
  );

  return (
    <Modal title={mode === "create" ? "ساختن سرور" : "پیوستن به سرور"} onClose={onClose} wide={mode === "create"}>
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
        {mode === "create" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted">از کجا شروع کنیم؟</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SERVER_TEMPLATES.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                    templateId === t.id ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
                  )}
                >
                  <input type="radio" name="template" className="sr-only" checked={templateId === t.id} onChange={() => setTemplateId(t.id)} />
                  <TemplateIcon icon={t.icon} active={templateId === t.id} />
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-xs leading-5 text-muted">{t.hint}</span>
                </label>
              ))}
            </div>
            <TemplatePreview template={template} />
          </fieldset>
        )}
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

const TEMPLATE_ICONS = { sparkles: Sparkles, gamepad: Gamepad2, school: School, home: House, users: Users } as const;

function TemplateIcon({ icon, active }: { icon: ServerTemplate["icon"]; active: boolean }) {
  const Icon = TEMPLATE_ICONS[icon];
  return (
    <span className={cn("grid size-9 place-items-center rounded-xl", active ? "bg-accent-strong text-on-accent" : "bg-ink-800 text-muted")}>
      <Icon className="size-5" />
    </span>
  );
}

/** What the picked template will make, so the choice isn't a guess. */
function TemplatePreview({ template }: { template: ServerTemplate }) {
  const iconOf = (c: ServerTemplate["categories"][number]["channels"][number]) =>
    c.announcement ? Megaphone : c.type === "voice" ? Volume2 : c.type === "cinema" ? Clapperboard : c.postRoles ? PenOff : Hash;
  return (
    <div className="rounded-2xl bg-ink-850 p-3 ring-1 ring-line">
      <div className="scrollbar-thin grid max-h-48 gap-3 overflow-y-auto sm:grid-cols-3">
        {template.categories.map((g, i) => (
          <div key={i} className="min-w-0">
            {g.name && <p className="mb-1 truncate text-[11px] font-bold text-muted">{g.name}</p>}
            <ul className="space-y-0.5">
              {g.channels.map((c) => {
                const Icon = iconOf(c);
                return (
                  <li key={c.name} className="flex items-center gap-1.5 text-sm">
                    <Icon className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">{c.name}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {template.roles && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {template.roles.map((r) => (
            <span key={r.key} className="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-xs">
              <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
              {r.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Who a channel is for. Public by default; private ones list the roles (by id) and people let in. */
interface ChannelAccessValue {
  isPrivate: boolean;
  allowedRoles: string[];
  allowedMembers: string[];
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

const sameAccess = (a: ChannelAccessValue, b: ChannelAccessValue) =>
  a.isPrivate === b.isPrivate &&
  (!a.isPrivate || (JSON.stringify([...a.allowedRoles].sort()) === JSON.stringify([...b.allowedRoles].sort()) && JSON.stringify([...a.allowedMembers].sort()) === JSON.stringify([...b.allowedMembers].sort())));

function ChannelAccessFields({
  value,
  members,
  roles: allRoles,
  onChange,
}: {
  value: ChannelAccessValue;
  members: MemberDTO[];
  roles: RoleDTO[];
  onChange: (v: ChannelAccessValue) => void;
}) {
  // Whoever sees every private channel is let in anyway, so listing them would only be noise.
  const roles = allRoles.filter((r) => !r.permissions.includes("channel:view_private"));
  const people = members.filter((m) => !can(standingOf(m, allRoles), "channel:view_private"));
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
          <p className="text-xs text-muted">فقط مالک، نقش‌هایی که همهٔ کانال‌های خصوصی را می‌بینند و کسانی که انتخاب می‌کنید</p>
        </div>
      </label>

      {value.isPrivate && (
        <>
          {roles.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm text-muted">نقش‌هایی که وارد می‌شوند</legend>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <label
                    key={r.id}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                      value.allowedRoles.includes(r.id) ? "border-accent bg-accent-strong/10" : "border-line text-muted hover:bg-ink-800",
                    )}
                  >
                    <input type="checkbox" className="sr-only" checked={value.allowedRoles.includes(r.id)} onChange={() => onChange({ ...value, allowedRoles: toggle(value.allowedRoles, r.id) })} />
                    <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

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

/** Who writes in a text channel and how often. Announcement channels are always limited to their writers. */
export interface ChannelPostingValue {
  posting: "everyone" | "roles";
  postRoles: string[];
  slowmode: number;
  announcement: boolean;
}

const samePosting = (a: ChannelPostingValue, b: ChannelPostingValue) =>
  a.announcement === b.announcement &&
  a.slowmode === b.slowmode &&
  (a.announcement || a.posting === b.posting) &&
  JSON.stringify([...a.postRoles].sort()) === JSON.stringify([...b.postRoles].sort());

export function slowmodeLabel(seconds: number) {
  if (!seconds) return "خاموش";
  if (seconds < 60) return `${toPersianDigits(seconds)} ثانیه`;
  if (seconds < 3600) return `${toPersianDigits(seconds / 60)} دقیقه`;
  return `${toPersianDigits(seconds / 3600)} ساعت`;
}

function ChannelPostingFields({
  value,
  roles: allRoles,
  onChange,
  showAnnouncement,
}: {
  value: ChannelPostingValue;
  roles: RoleDTO[];
  onChange: (v: ChannelPostingValue) => void;
  /** The create dialog picks announcements as a kind of channel; the edit dialog turns it on and off here. */
  showAnnouncement: boolean;
}) {
  // Those who manage channels always write, so listing their roles would only be noise.
  const roles = allRoles.filter((r) => !r.permissions.includes("channel:manage"));
  const limited = value.announcement || value.posting === "roles";
  return (
    <div className="space-y-3">
      {showAnnouncement && (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
            value.announcement ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
          )}
        >
          <input type="checkbox" className="sr-only" checked={value.announcement} onChange={(e) => onChange({ ...value, announcement: e.target.checked })} />
          <Megaphone className="size-5 text-muted" />
          <div>
            <p className="font-semibold">کانال اطلاع‌رسانی</p>
            <p className="text-xs text-muted">فقط مدیران و نقش‌هایی که انتخاب می‌کنید می‌نویسند؛ بقیه می‌خوانند و واکنش می‌گذارند</p>
          </div>
        </label>
      )}
      {!value.announcement && (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
            value.posting === "roles" ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
          )}
        >
          <input type="checkbox" className="sr-only" checked={value.posting === "roles"} onChange={(e) => onChange({ ...value, posting: e.target.checked ? "roles" : "everyone" })} />
          <PenOff className="size-5 text-muted" />
          <div>
            <p className="font-semibold">فقط خواندنی برای بقیه</p>
            <p className="text-xs text-muted">فقط مدیران کانال و نقش‌هایی که انتخاب می‌کنید می‌توانند پیام بفرستند</p>
          </div>
        </label>
      )}
      {limited && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm text-muted">نقش‌هایی که می‌نویسند</legend>
          {roles.length ? (
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                    value.postRoles.includes(r.id) ? "border-accent bg-accent-strong/10" : "border-line text-muted hover:bg-ink-800",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={value.postRoles.includes(r.id)} onChange={() => onChange({ ...value, postRoles: toggle(value.postRoles, r.id) })} />
                  <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">نقش دیگری نیست؛ فقط مالک و مدیران کانال می‌نویسند.</p>
          )}
        </fieldset>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm text-muted">حالت آهسته</span>
        <Select value={String(value.slowmode)} onChange={(e) => onChange({ ...value, slowmode: Number(e.target.value) })} className="text-sm">
          {SLOWMODE_STEPS.map((n) => (
            <option key={n} value={n}>
              {n ? `هر نفر هر ${slowmodeLabel(n)} یک پیام` : "خاموش"}
            </option>
          ))}
        </Select>
        <span className="block text-xs text-muted">مدیران و ناظران از حالت آهسته مستثنا هستند.</span>
      </label>
    </div>
  );
}

const NO_POSTING: ChannelPostingValue = { posting: "everyone", postRoles: [], slowmode: 0, announcement: false };

/** Which category a channel sits in. Hidden while the server has none. */
function CategoryField({ categories, value, onChange }: { categories: CategoryDTO[]; value: string | null; onChange: (id: string | null) => void }) {
  if (!categories.length) return null;
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted">دسته</span>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="text-sm">
        <option value="">بدون دسته</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

const CHANNEL_KINDS = {
  text: { label: "متنی", hint: "پیام، لینک و گفت‌وگوی نوشتاری" },
  announcement: { label: "اطلاع‌رسانی", hint: "خبرها و اطلاعیه‌ها؛ فقط مدیران می‌نویسند" },
  voice: { label: "صوتی", hint: "گفت‌وگوی صوتی، تصویر و اشتراک صفحه" },
  cinema: { label: "سینما", hint: "کتابخانهٔ فیلم و تماشای هم‌زمان، همراه با گفت‌وگوی صوتی" },
} as const;

export function CreateChannelDialog({
  serverId,
  members,
  roles,
  categories,
  type: initialType,
  categoryId: initialCategory,
  onClose,
  onDone,
}: {
  serverId: string;
  members: MemberDTO[];
  roles: RoleDTO[];
  categories: CategoryDTO[];
  type: ChannelType;
  categoryId: string | null;
  onClose: () => void;
  onDone: (c: ChannelDTO) => void;
}) {
  const [kind, setKind] = useState<keyof typeof CHANNEL_KINDS>(initialType);
  const type: ChannelType = kind === "announcement" ? "text" : kind;
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [access, setAccess] = useState<ChannelAccessValue>({ isPrivate: false, allowedRoles: [], allowedMembers: [] });
  const [posting, setPosting] = useState<ChannelPostingValue>(NO_POSTING);
  const { busy, error, submit } = useSubmit(
    () =>
      api<{ channel: ChannelDTO }>(`/api/servers/${serverId}/channels`, {
        body: { name, type, categoryId, ...access, ...(type === "text" && { ...posting, announcement: kind === "announcement" }) },
      }),
    (res) => onDone(res.channel),
  );

  return (
    <Modal title="ساختن کانال" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          {(["text", "announcement", "voice", "cinema"] as const).map((t) => (
            <label
              key={t}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
                kind === t ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800",
              )}
            >
              <input type="radio" className="sr-only" checked={kind === t} onChange={() => setKind(t)} />
              {t === "text" ? (
                <Hash className="size-5 text-muted" />
              ) : t === "announcement" ? (
                <Megaphone className="size-5 text-muted" />
              ) : t === "voice" ? (
                <Volume2 className="size-5 text-muted" />
              ) : (
                <Clapperboard className="size-5 text-muted" />
              )}
              <div>
                <p className="font-semibold">{CHANNEL_KINDS[t].label}</p>
                <p className="text-xs text-muted">{CHANNEL_KINDS[t].hint}</p>
              </div>
            </label>
          ))}
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نام کانال</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus />
        </label>
        <CategoryField categories={categories} value={categoryId} onChange={setCategoryId} />
        <ChannelAccessFields value={access} members={members} roles={roles} onChange={setAccess} />
        {type === "text" && <ChannelPostingFields value={{ ...posting, announcement: kind === "announcement" }} roles={roles} onChange={setPosting} showAnnouncement={false} />}
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { canPrompt, iosManual, install } = useInstallPrompt();
  const nameChanged = name.trim() !== me.name;
  const { busy, error, submit } = useSubmit(
    () => api<{ user: MeDTO }>("/api/me", { method: "PATCH", body: { name } }),
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
    <Modal title="تنظیمات حساب" onClose={onClose}>
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-line">
        <div className="relative">
          <Avatar user={{ name: name || me.name, color: me.color, avatar: me.avatar, frame: me.frame }} size="lg" />
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
          <p className="mt-1.5 text-[11px] text-muted">{PICTURE_HINT}</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نامی که دیگران می‌بینند</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={name.trim().length < 2 || !nameChanged}>
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
  roles,
  categories,
  onClose,
  onNotify,
}: {
  channel: ChannelDTO;
  members: MemberDTO[];
  roles: RoleDTO[];
  categories: CategoryDTO[];
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(channel.name);
  const [categoryId, setCategoryId] = useState(channel.categoryId);
  const saved: ChannelAccessValue = { isPrivate: channel.isPrivate, allowedRoles: channel.allowedRoles, allowedMembers: channel.allowedMembers };
  const [access, setAccess] = useState<ChannelAccessValue>(saved);
  const savedPosting: ChannelPostingValue = { posting: channel.posting, postRoles: channel.postRoles, slowmode: channel.slowmode, announcement: channel.announcement };
  const [posting, setPosting] = useState<ChannelPostingValue>(savedPosting);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The server broadcasts the rename and the deletion, which updates every open screen including this one.
  const { busy, error, submit } = useSubmit(
    () => api(`/api/channels/${channel.id}`, { method: "PATCH", body: { name, categoryId, ...access, ...(channel.type === "text" && posting) } }),
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
        <CategoryField categories={categories} value={categoryId} onChange={setCategoryId} />
        <ChannelAccessFields value={access} members={members} roles={roles} onChange={setAccess} />
        {channel.type === "text" && <ChannelPostingFields value={posting} roles={roles} onChange={setPosting} showAnnouncement />}
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton
          busy={busy}
          disabled={!name.trim() || (name.trim() === channel.name && categoryId === channel.categoryId && sameAccess(access, saved) && samePosting(posting, savedPosting))}
        >
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

/** Make a category (`category` null), or rename, move or delete one. Its channels outlive it and move above every category. */
export function CategoryDialog({
  serverId,
  category,
  onClose,
  onNotify,
}: {
  serverId: string;
  category: CategoryDTO | null;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const path = category ? `/api/servers/${serverId}/categories/${category.id}` : `/api/servers/${serverId}/categories`;
  // The server broadcasts every change, which updates the sidebar on every open screen including this one.
  const { busy, error, submit } = useSubmit(() => api(path, category ? { method: "PATCH", body: { name } } : { body: { name } }), onClose);

  const act = async (action: () => Promise<unknown>, close: boolean) => {
    setWorking(true);
    try {
      await action();
      if (close) onClose();
    } catch (err) {
      onNotify((err as Error).message);
    }
    setWorking(false);
    setConfirmDelete(false);
  };
  const move = (direction: "up" | "down") => act(() => api(path, { method: "PATCH", body: { move: direction } }), false);

  return (
    <Modal title={category ? "تنظیمات دسته" : "ساختن دسته"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نام دسته</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!name.trim() || name.trim() === category?.name}>
          {category ? "ذخیره" : "ساختن دسته"}
        </SubmitButton>
      </form>
      {category && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => move("up")} disabled={working} className="flex items-center justify-center gap-2 rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted hover:text-fg disabled:opacity-60">
              <ArrowUp className="size-4" />
              بالاتر
            </button>
            <button onClick={() => move("down")} disabled={working} className="flex items-center justify-center gap-2 rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted hover:text-fg disabled:opacity-60">
              <ArrowDown className="size-4" />
              پایین‌تر
            </button>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            {confirmDelete ? (
              <div className="rounded-xl bg-danger/10 p-3">
                <p className="mb-2 text-sm leading-6">دستهٔ «{category.name}» حذف شود؟ کانال‌هایش حذف نمی‌شوند و به بالای فهرست می‌روند.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => act(() => api(path, { method: "DELETE" }), true)}
                    disabled={working}
                    className="rounded-xl bg-danger-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-danger-strong/90 disabled:opacity-60"
                  >
                    حذف دسته
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted hover:text-fg">
                    انصراف
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10">
                <Trash2 className="size-4" />
                حذف دسته
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
