"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Hash,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  MessageSquare,
  Paperclip,
  Pencil,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Trash2,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { categoryLabel } from "@/lib/discovery";
import { cn, formatAgo, formatDate, formatDateTime, formatLastSeen } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { AdminChannelDTO, AdminMessageDTO, AdminServerDTO, AdminStatsDTO, AdminUserDTO, MeDTO } from "@/lib/types";
import Avatar, { ServerAvatar } from "@/components/app/Avatar";
import { Modal, SubmitButton, useSubmit } from "@/components/app/Dialogs";
import Skeleton from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

type Tab = "overview" | "users" | "servers" | "channels" | "messages";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "نمای کلی", icon: LayoutDashboard },
  { id: "users", label: "کاربران", icon: Users },
  { id: "servers", label: "سرورها", icon: ServerIcon },
  { id: "channels", label: "کانال‌ها", icon: Hash },
  { id: "messages", label: "پیام‌ها", icon: MessageSquare },
];

const num = new Intl.NumberFormat("fa-IR");
const fmt = (n: number) => num.format(n);

/** Narrows the channels and messages tabs to one server or channel, picked from the tab before it. */
type Scope = { id: string; name: string } | null;

export default function AdminPanel({ me, initialStats }: { me: MeDTO; initialStats: AdminStatsDTO }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [serverScope, setServerScope] = useState<Scope>(null);
  const [channelScope, setChannelScope] = useState<Scope>(null);

  return (
    <div className="min-h-dvh bg-ink-950 pt-safe px-safe">
      <header className="sticky top-0 z-30 border-b border-line bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            aria-label="بازگشت به صدامون"
            title="بازگشت به صدامون"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-ink-800 hover:text-fg"
          >
            <ArrowRight className="size-5" />
          </Link>
          <div className="min-w-0 flex-1 leading-6">
            <h1 className="text-lg font-bold">پنل مدیریت</h1>
            <p className="truncate text-xs text-muted">مدیریت کاربران، سرورها، کانال‌ها و پیام‌های صدامون</p>
          </div>
          <Avatar user={me} />
        </div>
        <nav className="scrollbar-none mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2" aria-label="بخش‌های پنل">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                tab === t.id ? "bg-accent-strong text-on-accent" : "text-muted hover:bg-ink-800 hover:text-fg",
              )}
            >
              <t.icon className="size-4" strokeWidth={2} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-safe-4">
        {tab === "overview" && <Overview initial={initialStats} onOpen={setTab} />}
        {tab === "users" && <UsersTab meId={me.id} />}
        {tab === "servers" && (
          <ServersTab
            onChannels={(s) => {
              setServerScope(s);
              setTab("channels");
            }}
          />
        )}
        {tab === "channels" && (
          <ChannelsTab
            scope={serverScope}
            onClearScope={() => setServerScope(null)}
            onMessages={(c) => {
              setChannelScope(c);
              setTab("messages");
            }}
          />
        )}
        {tab === "messages" && <MessagesTab scope={channelScope} onClearScope={() => setChannelScope(null)} />}
      </main>
    </div>
  );
}

// ---- Shared pieces -----------------------------------------------------------------------------

/** Fetches a list, again whenever the search text settles or `reload` is called. */
function useAdminList<T>(path: string, key: string, q: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        api<Record<string, T[]>>(path)
          .then((res) => live && (setItems(res[key]), setError(undefined)))
          .catch((err) => live && setError((err as Error).message));
      },
      q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [path, key, q, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { items, setItems, error, reload };
}

function Toolbar({ q, onQ, placeholder, onReload, children }: { q: string; onQ: (q: string) => void; placeholder: string; onReload: () => void; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-64">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          className="field ps-10 text-sm"
          dir={q ? "auto" : "rtl"}
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </label>
      {children}
      <IconButton label="تازه‌سازی" onClick={onReload}>
        <RefreshCw className="size-4" />
      </IconButton>
    </div>
  );
}

function ScopeChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex min-h-10 items-center gap-1 rounded-full bg-ink-800 ps-4 pe-1 text-sm">
      {label}
      <button type="button" onClick={onClear} aria-label="برداشتن فیلتر" className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink-700 hover:text-fg">
        <X className="size-4" />
      </button>
    </span>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
        danger ? "text-danger hover:bg-danger-strong/15" : "text-muted hover:bg-ink-800 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Badge({ tone = "default", children }: { tone?: "default" | "accent" | "danger"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "default" && "bg-ink-800 text-muted",
        tone === "accent" && "bg-accent-strong/15 text-accent",
        tone === "danger" && "bg-danger-strong/15 text-danger",
      )}
    >
      {children}
    </span>
  );
}

/** The list's skeleton, error or empty state; null once there are rows to show. */
function ListState({ items, error, empty, cols }: { items: unknown[] | null; error?: string; empty: string; cols: number }) {
  if (error && !items) return <p className="rounded-2xl border border-line px-4 py-10 text-center text-sm text-danger">{error}</p>;
  if (!items)
    return (
      <div className="space-y-2 rounded-2xl border border-line p-3" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            {Array.from({ length: cols }, (_, j) => (
              <Skeleton key={j} className="h-4 flex-1 rounded-md" />
            ))}
          </div>
        ))}
      </div>
    );
  if (!items.length) return <p className="rounded-2xl border border-line px-4 py-10 text-center text-sm text-muted">{empty}</p>;
  return null;
}

function Phone({ phone }: { phone: string }) {
  return (
    <span dir="ltr" className="whitespace-nowrap tabular-nums">
      {toPersianDigits(phone)}
    </span>
  );
}

/** Asks before something that can't be undone. With `confirmText`, that text has to be typed first. */
function ConfirmDialog({
  title,
  children,
  action,
  confirmText,
  onClose,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  action: string;
  confirmText?: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  const [typed, setTyped] = useState("");
  const { busy, error, submit } = useSubmit(onConfirm, onClose);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2 text-sm leading-7">{children}</div>
        {confirmText && (
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">
              برای تأیید، <b className="text-fg">{confirmText}</b> را بنویسید
            </span>
            <input className="field" dir="auto" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={busy || (!!confirmText && typed.trim() !== confirmText)} className="btn-primary w-full bg-danger-strong text-white">
          {action}
        </button>
      </form>
    </Modal>
  );
}

// ---- Overview ----------------------------------------------------------------------------------

function Overview({ initial, onOpen }: { initial: AdminStatsDTO; onOpen: (tab: Tab) => void }) {
  const [stats, setStats] = useState(initial);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    setStats(await api<AdminStatsDTO>("/api/admin/stats").catch(() => stats));
    setBusy(false);
  };

  const cards: { label: string; value: number; meta: string; icon: typeof Users; tab?: Tab }[] = [
    { label: "کاربران", value: stats.users, meta: `${fmt(stats.newUsers)} نفر در ۷ روز گذشته`, icon: Users, tab: "users" },
    { label: "آنلاین الان", value: stats.online, meta: `${fmt(stats.inVoice)} نفر در اتاق صوتی`, icon: Volume2 },
    { label: "سرورها", value: stats.servers, meta: `${fmt(stats.publicServers)} سرور در فهرست عمومی`, icon: ServerIcon, tab: "servers" },
    { label: "کانال‌ها", value: stats.channels, meta: `${fmt(stats.voiceChannels)} کانال صوتی`, icon: Hash, tab: "channels" },
    { label: "پیام‌ها", value: stats.messages, meta: `${fmt(stats.messagesWeek)} پیام در ۷ روز گذشته`, icon: MessageSquare, tab: "messages" },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">آمار کلی</h2>
        <button type="button" onClick={refresh} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-full px-4 text-sm text-muted hover:bg-ink-800 hover:text-fg">
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          تازه‌سازی
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => {
          const body = (
            <>
              <div className="flex items-center justify-between text-sm text-muted">
                {c.label}
                <c.icon className="size-5" strokeWidth={1.5} />
              </div>
              <p className="mt-2 text-3xl leading-tight font-bold tabular-nums">{fmt(c.value)}</p>
              <p className="mt-1 text-xs text-muted">{c.meta}</p>
            </>
          );
          const cls = "animate-pop-in panel block p-5 text-start";
          return c.tab ? (
            <button key={c.label} type="button" onClick={() => onOpen(c.tab!)} className={cn(cls, "transition-colors hover:bg-ink-850")} style={{ animationDelay: `${i * 40}ms` }}>
              {body}
            </button>
          ) : (
            <div key={c.label} className={cls} style={{ animationDelay: `${i * 40}ms` }}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- Users -------------------------------------------------------------------------------------

function UsersTab({ meId }: { meId: string }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const { items, setItems, error, reload } = useAdminList<AdminUserDTO>(`/api/admin/users?q=${encodeURIComponent(q)}`, "users", q);
  const [editing, setEditing] = useState<AdminUserDTO>();
  const [deleting, setDeleting] = useState<AdminUserDTO>();
  const [signingOut, setSigningOut] = useState<AdminUserDTO>();

  const replace = (u: AdminUserDTO) => setItems((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null);

  return (
    <section>
      <Toolbar q={q} onQ={setQ} placeholder="جست‌وجوی نام یا شمارهٔ موبایل" onReload={reload} />
      <ListState items={items} error={error} empty="کاربری پیدا نشد" cols={4} />
      {!!items?.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کاربر</TableHead>
              <TableHead>موبایل</TableHead>
              <TableHead>سرورها</TableHead>
              <TableHead>عضویت</TableHead>
              <TableHead>آخرین بازدید</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">کارها</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex min-w-40 items-center gap-3">
                    <Avatar user={u} online={u.online} />
                    <div className="min-w-0 leading-6">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {u.name || <span className="text-muted">بدون نام</span>}
                        {u.isAdmin && <Badge tone="accent">مدیر سایت</Badge>}
                      </p>
                      {u.bio && <p className="max-w-56 truncate text-xs text-muted">{u.bio}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Phone phone={u.phone} />
                </TableCell>
                <TableCell numeric className="whitespace-nowrap">
                  {fmt(u.servers)}
                  {!!u.ownedServers && <span className="text-xs text-muted"> ({fmt(u.ownedServers)} مالک)</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted">{formatDate(u.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted">
                  {u.online ? <Badge tone="accent">آنلاین</Badge> : u.lastSeenAt ? formatLastSeen(u.lastSeenAt) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <IconButton label="ویرایش" onClick={() => setEditing(u)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="خروج از همهٔ دستگاه‌ها" onClick={() => setSigningOut(u)}>
                      <LogOut className="size-4" />
                    </IconButton>
                    {u.id !== meId && !u.isAdmin && (
                      <IconButton label="حذف کاربر" danger onClick={() => setDeleting(u)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(u) => {
            replace(u);
            toast({ title: "اطلاعات کاربر ذخیره شد", variant: "success" });
          }}
        />
      )}
      {signingOut && (
        <ConfirmDialog
          title="خروج از همهٔ دستگاه‌ها"
          action="خارج کن"
          onClose={() => setSigningOut(undefined)}
          onConfirm={async () => {
            const { user } = await api<{ user: AdminUserDTO }>(`/api/admin/users/${signingOut.id}`, { method: "PATCH", body: { signOut: true } });
            replace(user);
            toast({ title: `${signingOut.name || "کاربر"} از همهٔ دستگاه‌ها خارج شد`, variant: "success" });
          }}
        >
          <p>
            همهٔ نشست‌های <b>{signingOut.name || <Phone phone={signingOut.phone} />}</b> بسته می‌شود و باید دوباره با کد پیامکی وارد شود.
          </p>
        </ConfirmDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title="حذف کاربر"
          action="حذف برای همیشه"
          confirmText={deleting.phone}
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await api(`/api/admin/users/${deleting.id}`, { method: "DELETE" });
            setItems((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
            toast({ title: "کاربر حذف شد", variant: "success" });
          }}
        >
          <p>
            حساب <b>{deleting.name || "این کاربر"}</b> (<Phone phone={deleting.phone} />) پاک می‌شود، همراه با پیام‌ها، گفت‌وگوهای خصوصی و دوستی‌هایش.
          </p>
          {!!deleting.ownedServers && (
            <p className="text-danger">{fmt(deleting.ownedServers)} سروری که مالکش است هم با همهٔ کانال‌ها و پیام‌هایش حذف می‌شود.</p>
          )}
          <p className="text-muted">این کار برگشت‌پذیر نیست.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function EditUserDialog({ user, onClose, onSaved }: { user: AdminUserDTO; onClose: () => void; onSaved: (u: AdminUserDTO) => void }) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio);
  const { busy, error, submit } = useSubmit(
    () => api<{ user: AdminUserDTO }>(`/api/admin/users/${user.id}`, { method: "PATCH", body: { name, bio } }),
    (res) => {
      onSaved(res.user);
      onClose();
    },
  );
  return (
    <Modal title="ویرایش کاربر" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          <Phone phone={user.phone} />
        </p>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">نام</span>
          <input className="field" dir="auto" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus />
        </label>
        <label className="block space-y-1.5">
          <span className="flex justify-between text-xs text-muted">
            درباره من
            <span className="tabular-nums">{toPersianDigits(`${bio.length}/190`)}</span>
          </span>
          <textarea className="field min-h-24 resize-none" dir="auto" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={190} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={name.trim().length < 2}>
          ذخیره
        </SubmitButton>
      </form>
    </Modal>
  );
}

// ---- Servers -----------------------------------------------------------------------------------

function ServersTab({ onChannels }: { onChannels: (s: { id: string; name: string }) => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const { items, setItems, error, reload } = useAdminList<AdminServerDTO>(`/api/admin/servers?q=${encodeURIComponent(q)}`, "servers", q);
  const [renaming, setRenaming] = useState<AdminServerDTO>();
  const [deleting, setDeleting] = useState<AdminServerDTO>();

  const patch = async (s: AdminServerDTO, body: object, done: string) => {
    try {
      await api(`/api/admin/servers/${s.id}`, { method: "PATCH", body });
      toast({ title: done, variant: "success" });
      reload();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "error" });
    }
  };

  return (
    <section>
      <Toolbar q={q} onQ={setQ} placeholder="جست‌وجوی نام سرور یا کد دعوت" onReload={reload} />
      <ListState items={items} error={error} empty="سروری پیدا نشد" cols={4} />
      {!!items?.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>سرور</TableHead>
              <TableHead>مالک</TableHead>
              <TableHead>اعضا</TableHead>
              <TableHead>کانال‌ها</TableHead>
              <TableHead>ساخته‌شده</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">کارها</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex min-w-40 items-center gap-3">
                    <ServerAvatar name={s.name} icon={s.icon} className="size-9 rounded-xl text-sm" />
                    <div className="min-w-0 leading-6">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {s.isPublic ? <Badge tone="accent">عمومی · {categoryLabel(s.category)}</Badge> : <Badge>فقط با دعوت</Badge>}
                        <span dir="ltr" className="font-mono">
                          {s.inviteCode}
                        </span>
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {s.owner ? (
                    <div className="leading-6 whitespace-nowrap">
                      <p>{s.owner.name}</p>
                      <p className="text-xs text-muted">
                        <Phone phone={s.owner.phone} />
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableCell>
                <TableCell numeric>{fmt(s.members)}</TableCell>
                <TableCell numeric>{fmt(s.channels)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted">{formatDate(s.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <IconButton label="کانال‌ها" onClick={() => onChannels({ id: s.id, name: s.name })}>
                      <Hash className="size-4" />
                    </IconButton>
                    <IconButton label="تغییر نام" onClick={() => setRenaming(s)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="لینک دعوت تازه" onClick={() => patch(s, { renewInvite: true }, "لینک دعوت عوض شد")}>
                      <Link2 className="size-4" />
                    </IconButton>
                    {s.isPublic && (
                      <IconButton label="برداشتن از فهرست عمومی" onClick={() => patch(s, { unlist: true }, "سرور از فهرست عمومی برداشته شد")}>
                        <EyeOff className="size-4" />
                      </IconButton>
                    )}
                    <IconButton label="حذف سرور" danger onClick={() => setDeleting(s)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {renaming && (
        <RenameDialog
          title="تغییر نام سرور"
          initial={renaming.name}
          maxLength={40}
          onClose={() => setRenaming(undefined)}
          onSave={async (name) => {
            await api(`/api/admin/servers/${renaming.id}`, { method: "PATCH", body: { name } });
            setItems((list) => list?.map((x) => (x.id === renaming.id ? { ...x, name: name.trim() } : x)) ?? null);
            toast({ title: "نام سرور عوض شد", variant: "success" });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="حذف سرور"
          action="حذف برای همیشه"
          confirmText={deleting.name}
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await api(`/api/admin/servers/${deleting.id}`, { method: "DELETE" });
            setItems((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
            toast({ title: "سرور حذف شد", variant: "success" });
          }}
        >
          <p>
            سرور <b>{deleting.name}</b> با {fmt(deleting.channels)} کانال و همهٔ پیام‌ها و فایل‌هایش پاک می‌شود و {fmt(deleting.members)} عضو آن بیرون می‌روند.
          </p>
          <p className="text-muted">این کار برگشت‌پذیر نیست.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function RenameDialog({
  title,
  initial,
  maxLength,
  onClose,
  onSave,
}: {
  title: string;
  initial: string;
  maxLength: number;
  onClose: () => void;
  onSave: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initial);
  const { busy, error, submit } = useSubmit(() => onSave(name), onClose);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input className="field" dir="auto" value={name} onChange={(e) => setName(e.target.value)} maxLength={maxLength} autoFocus aria-label="نام" />
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!name.trim() || name.trim() === initial}>
          ذخیره
        </SubmitButton>
      </form>
    </Modal>
  );
}

// ---- Channels ----------------------------------------------------------------------------------

function ChannelsTab({ scope, onClearScope, onMessages }: { scope: Scope; onClearScope: () => void; onMessages: (c: { id: string; name: string }) => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const path = `/api/admin/channels?q=${encodeURIComponent(q)}${scope ? `&serverId=${scope.id}` : ""}`;
  const { items, setItems, error, reload } = useAdminList<AdminChannelDTO>(path, "channels", q);
  const [renaming, setRenaming] = useState<AdminChannelDTO>();
  const [deleting, setDeleting] = useState<AdminChannelDTO>();

  return (
    <section>
      <Toolbar q={q} onQ={setQ} placeholder="جست‌وجوی نام کانال" onReload={reload}>
        {scope && <ScopeChip label={`سرور: ${scope.name}`} onClear={onClearScope} />}
      </Toolbar>
      <ListState items={items} error={error} empty="کانالی پیدا نشد" cols={3} />
      {!!items?.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کانال</TableHead>
              <TableHead>سرور</TableHead>
              <TableHead>پیام‌ها</TableHead>
              <TableHead>ساخته‌شده</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">کارها</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex min-w-36 items-center gap-2">
                    {c.type === "voice" ? <Volume2 className="size-4 shrink-0 text-muted" /> : <Hash className="size-4 shrink-0 text-muted" />}
                    <span className="truncate font-medium">{c.name}</span>
                    {c.isPrivate && <Lock className="size-3.5 shrink-0 text-muted" aria-label="خصوصی" />}
                    {!!c.inVoice && <Badge tone="accent">{fmt(c.inVoice)} نفر داخل</Badge>}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{c.server.name}</TableCell>
                <TableCell numeric>{fmt(c.messages)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted">{formatDate(c.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {c.type === "text" && (
                      <IconButton label="پیام‌ها" onClick={() => onMessages({ id: c.id, name: c.name })}>
                        <Eye className="size-4" />
                      </IconButton>
                    )}
                    <IconButton label="تغییر نام" onClick={() => setRenaming(c)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="حذف کانال" danger onClick={() => setDeleting(c)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {renaming && (
        <RenameDialog
          title="تغییر نام کانال"
          initial={renaming.name}
          maxLength={32}
          onClose={() => setRenaming(undefined)}
          onSave={async (name) => {
            await api(`/api/admin/channels/${renaming.id}`, { method: "PATCH", body: { name } });
            reload();
            toast({ title: "نام کانال عوض شد", variant: "success" });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="حذف کانال"
          action="حذف کانال"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await api(`/api/admin/channels/${deleting.id}`, { method: "DELETE" });
            setItems((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
            toast({ title: "کانال حذف شد", variant: "success" });
          }}
        >
          <p>
            کانال <b>{deleting.name}</b> در سرور <b>{deleting.server.name}</b> با {fmt(deleting.messages)} پیامش پاک می‌شود.
          </p>
          <p className="text-muted">این کار برگشت‌پذیر نیست.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

// ---- Messages ----------------------------------------------------------------------------------

function MessagesTab({ scope, onClearScope }: { scope: Scope; onClearScope: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const path = `/api/admin/messages?q=${encodeURIComponent(q)}${scope ? `&channelId=${scope.id}` : ""}`;
  const { items, setItems, error, reload } = useAdminList<AdminMessageDTO>(path, "messages", q);
  const [deleting, setDeleting] = useState<AdminMessageDTO>();

  return (
    <section>
      <Toolbar q={q} onQ={setQ} placeholder="جست‌وجو در متن پیام‌ها" onReload={reload}>
        {scope && <ScopeChip label={`کانال: ${scope.name}`} onClear={onClearScope} />}
      </Toolbar>
      <p className="mb-3 text-xs text-muted">فقط پیام‌های کانال‌های سرورها اینجا می‌آید؛ گفت‌وگوهای خصوصی بین دو نفر نشان داده نمی‌شود.</p>
      <ListState items={items} error={error} empty="پیامی پیدا نشد" cols={3} />
      {!!items?.length && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {items.map((m) => (
            <li key={m.id} className="flex gap-3 px-4 py-3 transition-colors hover:bg-ink-850">
              {m.author ? <Avatar user={{ name: m.author.name, color: m.author.color }} /> : <span className="size-9 shrink-0 rounded-full bg-ink-800" />}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-6">
                  <b className="font-semibold">{m.author?.name ?? "کاربر حذف‌شده"}</b>
                  <span className="text-xs text-muted">
                    {m.server.name} · #{m.channel.name}
                  </span>
                  <time className="text-xs text-muted" dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
                    {formatAgo(m.createdAt)}
                  </time>
                </p>
                <p className="bidi-lines text-sm leading-7 break-words whitespace-pre-wrap" dir="auto">
                  {m.content || <span className="text-muted">{m.sticker ? "استیکر" : "بدون متن"}</span>}
                </p>
                {!!m.attachments && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                    <Paperclip className="size-3.5" />
                    {fmt(m.attachments)} پیوست
                  </p>
                )}
              </div>
              <IconButton label="حذف پیام" danger onClick={() => setDeleting(m)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="حذف پیام"
          action="حذف پیام"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await api(`/api/admin/messages/${deleting.id}`, { method: "DELETE" });
            setItems((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
            toast({ title: "پیام حذف شد", variant: "success" });
          }}
        >
          <p>
            این پیام از <b>{deleting.author?.name ?? "کاربر حذف‌شده"}</b> در #{deleting.channel.name} برای همه پاک می‌شود.
          </p>
          {deleting.content && <p className="line-clamp-3 rounded-xl bg-ink-800 px-3 py-2 text-muted">{deleting.content}</p>}
        </ConfirmDialog>
      )}
    </section>
  );
}
