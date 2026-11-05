"use client";

import { useRef, useState } from "react";
import { Camera, Crown, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { PICTURE_HINT, resizeToAvatar } from "@/lib/image";
import { shareInvite } from "@/lib/invite";
import { can } from "@/lib/permissions";
import type { ChannelDTO, DiscoverySettingsDTO, MemberDTO, RoleDTO, ServerDetailDTO, ServerDTO, WelcomeDTO } from "@/lib/types";
import Avatar, { ServerAvatar } from "./Avatar";
import { inputClass, Modal, SubmitButton, useSubmit } from "./Dialogs";
import BansSettings from "./BansSettings";
import RolesSettings from "./RolesSettings";
import { DiscoverySettings, WelcomeSettings } from "./ServerOnboardingSettings";

const dangerButton = "rounded-xl bg-danger-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-danger-strong/90 disabled:opacity-60";
const quietButton = "rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted hover:text-fg";

const TABS = [
  { id: "general", label: "عمومی", permission: "server:manage" },
  { id: "roles", label: "نقش‌ها", permission: "role:manage" },
  { id: "discovery", label: "کاوش", permission: "server:manage" },
  { id: "welcome", label: "خوش‌آمدگویی", permission: "server:manage" },
  { id: "bans", label: "مسدودها", permission: "member:moderate" },
] as const;

/**
 * Rename the server or change its picture, renew its invite link, give it to someone else or delete it; list it in the public directory;
 * and set up what newcomers see. Owners and admins see everything except ownership, which belongs to the owner alone.
 */
export default function ServerSettingsDialog({
  server,
  members,
  roles,
  channels,
  discovery,
  welcome,
  meId,
  onClose,
  onChanged,
  onNotify,
}: {
  server: ServerDTO;
  members: MemberDTO[];
  roles: RoleDTO[];
  channels: ChannelDTO[];
  discovery: DiscoverySettingsDTO;
  welcome: WelcomeDTO;
  meId: string;
  onClose: () => void;
  /** Called with the fresh server detail after something changed. */
  onChanged: (detail: ServerDetailDTO) => void;
  onNotify: (message: string) => void;
}) {
  const isOwner = can(server.standing, "server:own");
  // Each tab needs its own permission: someone who only manages roles sees just the roles.
  const tabs = TABS.filter((t) => can(server.standing, t.permission));
  const [name, setName] = useState(server.name);
  const [renewing, setRenewing] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [panel, setPanel] = useState<"transfer" | "delete" | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(tabs[0]?.id ?? "general");

  const rename = useSubmit(
    () => api<ServerDetailDTO>(`/api/servers/${server.id}`, { method: "PATCH", body: { name } }),
    (detail) => {
      onChanged(detail);
      onNotify("نام سرور تغییر کرد");
      onClose();
    },
  );

  const changeIcon = async (file: File | undefined) => {
    if (!file) return;
    setIconBusy(true);
    try {
      const body = await resizeToAvatar(file);
      const res = await fetch(`/api/servers/${server.id}/icon`, { method: "POST", body, headers: { "Content-Type": body.type } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "بارگذاری تصویر ممکن نشد");
      onChanged(data);
      onNotify("تصویر سرور تغییر کرد");
    } catch (err) {
      onNotify(err instanceof DOMException ? "این فایل تصویر معتبری نیست" : (err as Error).message);
    } finally {
      setIconBusy(false);
      if (iconInput.current) iconInput.current.value = "";
    }
  };

  const removeIcon = async () => {
    setIconBusy(true);
    try {
      onChanged(await api<ServerDetailDTO>(`/api/servers/${server.id}/icon`, { method: "DELETE" }));
      onNotify("تصویر سرور حذف شد");
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setIconBusy(false);
    }
  };

  const renew = async () => {
    setRenewing(true);
    try {
      onChanged(await api<ServerDetailDTO>(`/api/servers/${server.id}`, { method: "PATCH", body: { renewInvite: true } }));
      onNotify("لینک دعوت تازه ساخته شد. لینک قبلی دیگر کار نمی‌کند");
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setRenewing(false);
      setConfirmRenew(false);
    }
  };

  const link = `${typeof window === "undefined" ? "" : window.location.origin}/invite/${server.inviteCode}`;

  return (
    <Modal title="تنظیمات سرور" onClose={onClose}>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-ink-850 p-1 text-sm [scrollbar-width:none]">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("flex-1 shrink-0 rounded-full px-3 py-2 whitespace-nowrap sm:py-1.5", tab === t.id ? "bg-accent-strong text-on-accent" : "text-muted hover:text-fg")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "discovery" && <DiscoverySettings server={server} value={discovery} onChanged={onChanged} onNotify={onNotify} />}
      {tab === "roles" && <RolesSettings server={server} roles={roles} members={members} onNotify={onNotify} />}
      {tab === "bans" && <BansSettings server={server} onNotify={onNotify} />}
      {tab === "welcome" && <WelcomeSettings server={server} value={welcome} channels={channels} onChanged={onChanged} onNotify={onNotify} />}

      {tab === "general" && (
      <>
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-line">
        <div className="relative">
          <ServerAvatar name={name || server.name} icon={server.icon} className="size-20 rounded-full text-3xl" />
          {iconBusy && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60">
              <Loader2 className="size-6 animate-spin" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{name.trim() || server.name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={iconInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => changeIcon(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={iconBusy}
              onClick={() => iconInput.current?.click()}
              className="flex items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1.5 text-xs font-semibold hover:bg-ink-700 disabled:opacity-60"
            >
              <Camera className="size-3.5" />
              {server.icon ? "تغییر تصویر" : "افزودن تصویر"}
            </button>
            {server.icon && (
              <button
                type="button"
                disabled={iconBusy}
                onClick={removeIcon}
                className="rounded-full px-3 py-1.5 text-xs text-muted hover:text-danger disabled:opacity-60"
              >
                حذف
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{PICTURE_HINT}</p>
        </div>
      </div>
      <form onSubmit={rename.submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نام سرور</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        {rename.error && <p className="text-sm text-danger">{rename.error}</p>}
        <SubmitButton busy={rename.busy} disabled={name.trim().length < 2 || name.trim() === server.name}>
          ذخیره
        </SubmitButton>
      </form>

      <section className="mt-5 space-y-2 border-t border-line pt-4">
        <h3 className="text-xs font-semibold text-muted">لینک دعوت</h3>
        <button
          onClick={() => shareInvite(server, onNotify)}
          dir="ltr"
          className="flex w-full items-center gap-2 rounded-xl bg-ink-850 px-3 py-2.5 text-start text-sm ring-1 ring-line hover:ring-accent/50"
        >
          <Link2 className="size-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate">{link}</span>
        </button>
        {confirmRenew ? (
          <div className="rounded-xl bg-danger/10 p-3">
            <p className="mb-2 text-sm leading-6">لینک فعلی از کار می‌افتد و باید لینک تازه را دوباره بفرستید. اعضای فعلی تغییری نمی‌کنند.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={renew} disabled={renewing} className={dangerButton}>
                ساختن لینک تازه
              </button>
              <button onClick={() => setConfirmRenew(false)} className={quietButton}>
                انصراف
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRenew(true)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-ink-800 hover:text-fg"
          >
            <RefreshCw className="size-4" />
            ساختن لینک دعوت تازه
          </button>
        )}
      </section>

      {isOwner && (
        <section className="mt-5 space-y-2 border-t border-line pt-4">
          <h3 className="text-xs font-semibold text-muted">مالکیت سرور</h3>
          {panel === "transfer" ? (
            <TransferPanel
              server={server}
              members={members.filter((m) => m.user.id !== meId)}
              onCancel={() => setPanel(null)}
              onDone={(detail) => {
                onChanged(detail);
                onNotify("مالکیت سرور منتقل شد");
                onClose();
              }}
            />
          ) : (
            <PanelButton onClick={() => setPanel("transfer")}>
              <Crown className="size-4 text-amber-300" />
              واگذاری مالکیت
            </PanelButton>
          )}
          {panel === "delete" ? (
            <DeletePanel server={server} onCancel={() => setPanel(null)} onDone={onClose} />
          ) : (
            <PanelButton danger onClick={() => setPanel("delete")}>
              <Trash2 className="size-4" />
              حذف سرور
            </PanelButton>
          )}
        </section>
      )}
      </>
      )}
    </Modal>
  );
}

function PanelButton({ danger, onClick, children }: { danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-ink-800 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function TransferPanel({
  server,
  members,
  onCancel,
  onDone,
}: {
  server: ServerDTO;
  members: MemberDTO[];
  onCancel: () => void;
  onDone: (detail: ServerDetailDTO) => void;
}) {
  const [target, setTarget] = useState<MemberDTO | null>(null);
  const { busy, error, submit } = useSubmit(
    () => api<ServerDetailDTO>(`/api/servers/${server.id}`, { method: "PATCH", body: { ownerId: target?.user.id } }),
    onDone,
  );

  if (!members.length) {
    return (
      <div className="rounded-xl bg-ink-850 p-3 text-sm leading-6 text-muted">
        هنوز عضو دیگری در سرور نیست. اول کسی را دعوت کنید.
        <button onClick={onCancel} className="mt-2 block text-accent">
          بستن
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-ink-850 p-3 ring-1 ring-line">
      <p className="text-sm leading-6">مالک جدید را انتخاب کنید. شما مدیر می‌شوید و دیگر نمی‌توانید سرور را حذف یا واگذار کنید.</p>
      <ul className="scrollbar-thin max-h-48 space-y-0.5 overflow-y-auto">
        {members.map((m) => (
          <li key={m.user.id}>
            <button
              type="button"
              onClick={() => setTarget(m)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start",
                target?.user.id === m.user.id ? "bg-accent-strong/20 ring-1 ring-accent/50" : "hover:bg-ink-850",
              )}
            >
              <Avatar user={m.user} />
              <span className="truncate text-sm font-semibold">{m.user.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!target || busy} className={cn(dangerButton, "flex items-center justify-center gap-2")}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          واگذاری
        </button>
        <button type="button" onClick={onCancel} className={quietButton}>
          انصراف
        </button>
      </div>
    </form>
  );
}

function DeletePanel({ server, onCancel, onDone }: { server: ServerDTO; onCancel: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  // The server's own "server:removed" event takes it off every screen, including this one.
  const { busy, error, submit } = useSubmit(
    () => api(`/api/servers/${server.id}`, { method: "DELETE", body: { confirmName: typed } }),
    onDone,
  );

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-danger/10 p-3">
      <p className="text-sm leading-6">
        سرور با همهٔ کانال‌ها، پیام‌ها و رویدادهایش برای همیشه حذف می‌شود. برای تأیید، نام سرور را بنویسید: <b>{server.name}</b>
      </p>
      <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={server.name} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy || typed.trim() !== server.name} className={cn(dangerButton, "flex items-center justify-center gap-2")}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          حذف برای همیشه
        </button>
        <button type="button" onClick={onCancel} className={quietButton}>
          انصراف
        </button>
      </div>
    </form>
  );
}
