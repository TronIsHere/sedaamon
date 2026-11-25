"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  Captions,
  Clapperboard,
  Download,
  Film,
  Loader2,
  MonitorSmartphone,
  Play,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { categoryLabel } from "@/lib/discovery";
import { cn, formatAgo, formatDate, formatDateTime, formatLastSeen } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import { defaultSubtitle, FILM_ACCEPT, filmClock, probeDuration, sizeLabel, SUBTITLE_ACCEPT, subtitleLabels } from "@/lib/movies";
import type { AdminChannelDTO, AdminMessageDTO, AdminMoviesDTO, AdminServerDTO, AdminStatsDTO, AdminUserDTO, MeDTO, MovieDTO, MovieImportDTO, MovieRepackageDTO } from "@/lib/types";
import Avatar, { ServerAvatar } from "@/components/app/Avatar";
import { Modal, SubmitButton, useSubmit } from "@/components/app/Dialogs";
import FileDrop from "@/components/ui/file-drop";
import Skeleton from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

type Tab = "overview" | "users" | "servers" | "channels" | "messages" | "films";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "نمای کلی", icon: LayoutDashboard },
  { id: "users", label: "کاربران", icon: Users },
  { id: "servers", label: "سرورها", icon: ServerIcon },
  { id: "channels", label: "کانال‌ها", icon: Hash },
  { id: "messages", label: "پیام‌ها", icon: MessageSquare },
  { id: "films", label: "فیلم‌ها", icon: Clapperboard },
];

const num = new Intl.NumberFormat("fa-IR");
const fmt = (n: number) => num.format(n);

/** Narrows the channels and messages tabs to one server or channel, picked from the tab before it. */
type Scope = { id: string; name: string } | null;

export default function AdminPanel({ me, initialStats, initialTab }: { me: MeDTO; initialStats: AdminStatsDTO; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.id === initialTab)?.id ?? "overview");
  // An upload keeps going while another tab is open, so the films tab stays mounted once visited.
  const [filmsOpened, setFilmsOpened] = useState(tab === "films");
  if (tab === "films" && !filmsOpened) setFilmsOpened(true);
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
            <p className="truncate text-xs text-muted">مدیریت کاربران، سرورها، کانال‌ها، پیام‌ها و فیلم‌های صدامون</p>
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
        {filmsOpened && (
          <div hidden={tab !== "films"}>
            <FilmsTab />
          </div>
        )}
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
  harmless,
  onClose,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  action: string;
  confirmText?: string;
  /** Not a deletion, so the button isn't red. */
  harmless?: boolean;
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
        <button disabled={busy || (!!confirmText && typed.trim() !== confirmText)} className={cn("btn-primary w-full", !harmless && "bg-danger-strong text-white")}>
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
                    {c.type === "voice" ? (
                      <Volume2 className="size-4 shrink-0 text-muted" />
                    ) : c.type === "cinema" ? (
                      <Clapperboard className="size-4 shrink-0 text-muted" />
                    ) : (
                      <Hash className="size-4 shrink-0 text-muted" />
                    )}
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

// ---- Films -------------------------------------------------------------------------------------

interface Upload {
  name: string;
  loaded: number;
  total: number;
  cancel: () => void;
}

/** The app-wide film library every cinema room plays from: upload, have the server download, rename, remove. */
function FilmsTab() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [data, setData] = useState<AdminMoviesDTO | null>(null);
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const picker = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState<MovieDTO>();
  const [renaming, setRenaming] = useState<MovieDTO>();
  const [subtitling, setSubtitling] = useState<MovieDTO>();
  const [deleting, setDeleting] = useState<MovieDTO>();
  const [repackaging, setRepackaging] = useState<MovieDTO>();

  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        api<AdminMoviesDTO>(`/api/movies?q=${encodeURIComponent(q)}`)
          .then((res) => live && (setData(res), setError(undefined)))
          .catch((err) => live && setError((err as Error).message));
      },
      q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, nonce]);

  // While the server is downloading or repackaging something, check on it every couple of seconds.
  const downloading =
    !!data?.imports.some((i) => i.status === "downloading" || i.status === "processing") || !!data?.repackages.some(isRepackaging);
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(reload, 2000);
    return () => clearInterval(timer);
  }, [downloading, reload]);

  // Leaving the page would cut an upload short.
  useEffect(() => {
    if (!upload) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [upload]);

  const maxBytes = data?.maxBytes ?? Infinity;

  async function startUpload(file: File) {
    if (file.size > maxBytes) {
      toast({ title: `حجم فیلم نباید بیشتر از ${sizeLabel(maxBytes)} باشد`, variant: "error" });
      return;
    }
    let duration: number | null = null;
    try {
      duration = await probeDuration(file);
    } catch {
      // Safari can't read an x265 MKV, but the server can, and can then repackage it.
      if (!data?.canRepackage) {
        toast({ title: "مرورگر این فایل را پخش نمی‌کند. فایل MP4 (H.264 و AAC) یا WebM انتخاب کنید", variant: "error" });
        return;
      }
    }
    const xhr = new XMLHttpRequest();
    setUpload({ name: file.name, loaded: 0, total: file.size, cancel: () => xhr.abort() });
    xhr.open("POST", "/api/movies");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Movie-Name", encodeURIComponent(file.name));
    if (duration !== null) xhr.setRequestHeader("X-Movie-Duration", String(duration));
    xhr.upload.onprogress = (e) => setUpload((u) => (u ? { ...u, loaded: e.loaded, total: e.total || u.total } : u));
    xhr.onload = () => {
      setUpload(null);
      let body: { movie?: MovieDTO; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.movie) {
        toast({ title: duration === null ? "فیلم اضافه شد. برای پخش در سافاری، دکمهٔ آماده‌سازی آن را بزنید" : "فیلم به کتابخانه اضافه شد", variant: "success" });
        reload();
      } else {
        toast({ title: body.error ?? (xhr.status === 413 ? "فیلم برای سرور بیش از حد بزرگ است" : "ارسال فیلم ممکن نشد"), variant: "error" });
      }
    };
    xhr.onerror = () => {
      setUpload(null);
      toast({ title: "ارسال فیلم قطع شد. اتصال را بررسی کنید و دوباره تلاش کنید", variant: "error" });
    };
    xhr.onabort = () => setUpload(null);
    xhr.send(file);
  }

  async function dropRepackage(id: string) {
    try {
      await api(`/api/movies/${id}/repackage`, { method: "DELETE" });
      reload();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "error" });
    }
  }

  async function dropImport(job: MovieImportDTO) {
    try {
      await api(`/api/movies/imports/${job.id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "error" });
    }
  }

  const movies = data?.movies ?? null;
  const percent = upload ? Math.floor((upload.loaded / Math.max(1, upload.total)) * 100) : 0;

  return (
    <section>
      <Toolbar q={q} onQ={setQ} placeholder="جست‌وجوی نام فیلم" onReload={reload}>
        <button type="button" onClick={() => setImporting(true)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-ink-800 px-4 text-sm font-semibold transition-colors hover:bg-ink-700">
          <Download className="size-4" />
          دانلود از لینک
        </button>
        <input
          ref={picker}
          type="file"
          accept={FILM_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void startUpload(file);
          }}
        />
        <button type="button" disabled={!!upload} onClick={() => picker.current?.click()} className="btn-primary shrink-0 px-4 text-sm">
          <Upload className="size-4" />
          آپلود فیلم
        </button>
      </Toolbar>

      <p className="mb-4 text-xs leading-6 text-muted">
        فیلم‌های این کتابخانه در همهٔ سینماهای صدامون دیده می‌شوند. قالب MP4، MKV یا WebM
        {data && <> · حداکثر {sizeLabel(data.maxBytes)}</>}
      </p>

      {(upload || !!data?.imports.length || !!data?.repackages.length) && (
        <ul className="mb-4 space-y-2">
          {upload && (
            <ProgressCard
              icon={<Upload className="size-4" />}
              title={upload.name}
              detail={`در حال آپلود · ${sizeLabel(upload.loaded)} از ${sizeLabel(upload.total)} · این صفحه را باز نگه دارید`}
              percent={percent}
              action={{ label: "لغو", onClick: upload.cancel }}
            />
          )}
          {data?.imports.map((job) => (
            <ProgressCard
              key={job.id}
              icon={<Download className="size-4" />}
              title={job.name ?? job.url}
              detail={importDetail(job)}
              tone={job.status === "failed" ? "danger" : job.status === "done" ? "accent" : "default"}
              percent={job.status === "downloading" && job.total ? Math.floor((job.received / job.total) * 100) : job.status === "processing" ? 100 : null}
              busy={job.status === "downloading" || job.status === "processing"}
              action={
                job.status === "processing"
                  ? undefined
                  : job.status === "downloading"
                    ? { label: "لغو", onClick: () => void dropImport(job) }
                    : { label: "بستن", onClick: () => void dropImport(job) }
              }
            />
          ))}
          {data?.repackages.map((job) => (
            <ProgressCard
              key={job.movieId}
              icon={<MonitorSmartphone className="size-4" />}
              title={job.name}
              detail={repackageDetail(job)}
              tone={job.status === "failed" ? "danger" : job.status === "done" ? "accent" : "default"}
              percent={job.status === "saving" ? 100 : job.percent}
              busy={isRepackaging(job)}
              action={job.status === "saving" ? undefined : { label: isRepackaging(job) ? "لغو" : "بستن", onClick: () => void dropRepackage(job.movieId) }}
            />
          ))}
        </ul>
      )}

      <ListState items={movies} error={error} empty={q ? "فیلمی با این نام پیدا نشد" : "کتابخانه خالی است. فیلمی آپلود کنید یا لینکش را بدهید"} cols={4} />
      {!!movies?.length && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>فیلم</TableHead>
              <TableHead>مدت</TableHead>
              <TableHead>حجم</TableHead>
              <TableHead>افزوده‌شده</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">کارها</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movies.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex min-w-44 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-800 text-accent">
                      <Film className="size-4" />
                    </span>
                    <div className="min-w-0 leading-6">
                      <p className="truncate font-medium">
                        <bdi>{m.name}</bdi>
                      </p>
                      <p className="text-xs text-muted">
                        {m.contentType === "video/webm" ? "MKV / WebM" : "MP4"}
                        {m.repackaged && " · آمادهٔ سافاری"}
                        {!!m.subtitles.length && ` · زیرنویس ${subtitleLabels(m.subtitles).join("، ")}`}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{filmClock(m.duration)}</TableCell>
                <TableCell className="whitespace-nowrap">{sizeLabel(m.size)}</TableCell>
                <TableCell>
                  <div className="leading-6 whitespace-nowrap">
                    <p>{formatDate(m.createdAt)}</p>
                    {m.uploadedBy && <p className="text-xs text-muted">{m.uploadedBy.name}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <IconButton label="پیش‌نمایش" onClick={() => setPreviewing(m)}>
                      <Play className="size-4" />
                    </IconButton>
                    {!m.repackaged && (
                      <IconButton label="آماده‌سازی برای سافاری و آیفون" onClick={() => setRepackaging(m)}>
                        <MonitorSmartphone className="size-4" />
                      </IconButton>
                    )}
                    <IconButton label="زیرنویس‌ها" onClick={() => setSubtitling(m)}>
                      <Captions className="size-4" />
                    </IconButton>
                    <IconButton label="تغییر نام" onClick={() => setRenaming(m)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="حذف فیلم" danger onClick={() => setDeleting(m)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onStarted={() => {
            toast({ title: "دانلود روی سرور شروع شد", variant: "success" });
            reload();
          }}
        />
      )}
      {previewing && (
        <Modal title={previewing.name} wide onClose={() => setPreviewing(undefined)}>
          <video src={previewing.url} controls autoPlay playsInline className="aspect-video w-full rounded-2xl bg-black">
            {previewing.subtitles.map((s, i) => (
              <track key={s.id} kind="subtitles" src={s.url} srcLang={s.lang} label={subtitleLabels(previewing.subtitles)[i]} default={s === defaultSubtitle(previewing.subtitles)} />
            ))}
          </video>
          <p className="mt-3 text-xs leading-6 text-muted">اگر تصویر یا صدا پخش نشد، قالب فیلم با این مرورگر جور نیست. اگر مشکل در سافاری یا آیفون است، دکمهٔ «آماده‌سازی برای سافاری و آیفون» را بزنید.</p>
        </Modal>
      )}
      {subtitling && (
        <SubtitlesDialog
          movie={subtitling}
          onClose={() => setSubtitling(undefined)}
          onChange={(movie) => {
            // Adding may finish after the dialog was closed; that must not open it again.
            setSubtitling((s) => (s?.id === movie.id ? movie : s));
            setData((d) => (d ? { ...d, movies: d.movies.map((x) => (x.id === movie.id ? movie : x)) } : d));
          }}
        />
      )}
      {renaming && (
        <RenameDialog
          title="تغییر نام فیلم"
          initial={renaming.name}
          maxLength={120}
          onClose={() => setRenaming(undefined)}
          onSave={async (name) => {
            await api(`/api/movies/${renaming.id}`, { method: "PATCH", body: { name } });
            reload();
            toast({ title: "نام فیلم عوض شد", variant: "success" });
          }}
        />
      )}
      {repackaging && (
        <ConfirmDialog
          title="آماده‌سازی برای سافاری و آیفون"
          action="شروع آماده‌سازی"
          harmless
          onClose={() => setRepackaging(undefined)}
          onConfirm={async () => {
            await api(`/api/movies/${repackaging.id}/repackage`, { method: "POST" });
            reload();
          }}
        >
          <p>
            سرور فیلم <b><bdi>{repackaging.name}</bdi></b> را به فایل MP4 مناسب سافاری تبدیل می‌کند. کیفیت تصویر دست نمی‌خورد و صدا استریوی AAC می‌شود. زیرنویس‌ها می‌مانند.
          </p>
          <p>فیلم تا پایان کار قابل پخش است. بعد فایل تازه جای فایل اصلی را می‌گیرد و پخش در سینماها یک لحظه از نو بارگذاری می‌شود.</p>
          <p className="text-muted">دستگاه‌هایی که x265 را پشتیبانی نمی‌کنند باز هم فیلم x265 را پخش نمی‌کنند. فایل اصلی و صدای چندکاناله برنمی‌گردد.</p>
          {!data?.canRepackage && <p className="text-danger">برنامهٔ ffmpeg روی سرور نصب نیست. اول باید نصب شود.</p>}
        </ConfirmDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title="حذف فیلم"
          action="حذف از کتابخانه"
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await api(`/api/movies/${deleting.id}`, { method: "DELETE" });
            setData((d) => (d ? { ...d, movies: d.movies.filter((x) => x.id !== deleting.id) } : d));
            toast({ title: "فیلم حذف شد", variant: "success" });
          }}
        >
          <p>
            فیلم <b>{deleting.name}</b> از کتابخانه و از روی سرور پاک می‌شود. اگر در سینمایی در حال پخش باشد، پخشش همان‌جا تمام می‌شود.
          </p>
          <p className="text-muted">این کار برگشت‌پذیر نیست.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** A film's subtitles: the ones that came inside it and the files added to it. */
function SubtitlesDialog({ movie, onClose, onChange }: { movie: MovieDTO; onClose: () => void; onChange: (movie: MovieDTO) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** The subtitle waiting for a yes before it is deleted. */
  const [asking, setAsking] = useState<string>();
  const labels = subtitleLabels(movie.subtitles);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const add = (files: File[]) =>
    run(async () => {
      for (const file of files) {
        const res = await fetch(`/api/movies/${movie.id}/subtitles`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-Subtitle-Name": encodeURIComponent(file.name) },
          body: file,
        });
        const body = (await res.json().catch(() => ({}))) as { movie?: MovieDTO; error?: string };
        // The name is isolated, so a Latin one doesn't turn the Persian message around.
        if (!res.ok || !body.movie) throw new Error(`\u2068${file.name}\u2069: ${body.error ?? "ارسال زیرنویس ممکن نشد"}`);
        onChange(body.movie);
      }
      toast({ title: files.length > 1 ? "زیرنویس‌ها اضافه شدند" : "زیرنویس اضافه شد", variant: "success" });
    });

  const remove = (id: string) =>
    run(async () => {
      const res = await api<{ movie: MovieDTO }>(`/api/movies/${movie.id}/subtitles/${id}`, { method: "DELETE" });
      setAsking(undefined);
      onChange(res.movie);
    });

  return (
    <Modal title="زیرنویس‌ها" onClose={onClose}>
      <p className="-mt-2 mb-4 truncate text-sm text-muted">
        <bdi>{movie.name}</bdi>
      </p>
      {movie.subtitles.length ? (
        <ul className="mb-4 space-y-1">
          {movie.subtitles.map((s, i) => (
            <li key={s.id} className="flex min-h-14 items-center gap-3 rounded-2xl bg-ink-850 py-1.5 ps-3 pe-1.5">
              <Captions className="size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1 leading-6">
                <p className="truncate text-sm font-medium">{labels[i]}</p>
                <p className="truncate text-xs text-muted">
                  {s.uploaded ? "فایل جدا" : "داخل فیلم"}
                  {s.uploaded && s.title && (
                    <>
                      {" · "}
                      <bdi>{s.title}</bdi>
                    </>
                  )}
                </p>
              </div>
              {asking === s.id ? (
                <span className="flex shrink-0 gap-1 text-xs">
                  <button type="button" disabled={busy} onClick={() => void remove(s.id)} className="min-h-10 rounded-full px-3 font-semibold text-danger transition-colors hover:bg-danger-strong/15">
                    حذف
                  </button>
                  <button type="button" disabled={busy} onClick={() => setAsking(undefined)} className="min-h-10 rounded-full px-3 text-muted transition-colors hover:bg-ink-800">
                    انصراف
                  </button>
                </span>
              ) : (
                <IconButton label={`حذف زیرنویس ${labels[i]}`} danger onClick={() => setAsking(s.id)}>
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm leading-7 text-muted">این فیلم زیرنویسی ندارد. فایل زیرنویس آن را اضافه کنید.</p>
      )}
      <FileDrop accept={SUBTITLE_ACCEPT} busy={busy} onFiles={(files) => void add(files)} hint="SRT، VTT یا ASS · زبان از متن زیرنویس تشخیص داده می‌شود" />
      {error && (
        <p role="alert" className="mt-3 text-sm leading-6 text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

const isRepackaging = (job: MovieRepackageDTO) => job.status === "waiting" || job.status === "converting" || job.status === "saving";

function repackageDetail(job: MovieRepackageDTO) {
  switch (job.status) {
    case "waiting":
      return "آماده‌سازی برای سافاری · در صف";
    case "converting":
      return "در حال آماده‌سازی برای سافاری";
    case "saving":
      return "ذخیرهٔ فایل تازه…";
    case "done":
      return "برای سافاری و آیفون آماده شد";
    case "failed":
      return job.error ?? "آماده‌سازی ممکن نشد";
  }
}

function importDetail(job: MovieImportDTO) {
  switch (job.status) {
    case "downloading":
      return job.total ? `دانلود روی سرور · ${sizeLabel(job.received)} از ${sizeLabel(job.total)}` : `دانلود روی سرور · ${sizeLabel(job.received)}`;
    case "processing":
      return "بررسی و ذخیرهٔ فیلم…";
    case "done":
      return "به کتابخانه اضافه شد";
    case "canceled":
      return "لغو شد";
    case "failed":
      return job.error ?? "دانلود نشد";
  }
}

function ProgressCard({
  icon,
  title,
  detail,
  percent,
  busy = true,
  tone = "default",
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  /** null while the size isn't known: the bar then just pulses. */
  percent: number | null;
  busy?: boolean;
  tone?: "default" | "accent" | "danger";
  action?: { label: string; onClick: () => void };
}) {
  return (
    <li className="rounded-2xl border border-line bg-ink-900 p-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            tone === "danger" ? "bg-danger-strong/15 text-danger" : tone === "accent" ? "bg-accent-strong/15 text-accent" : "bg-ink-800 text-muted",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
        </span>
        <div className="min-w-0 flex-1 leading-6">
          <p className="truncate text-sm font-medium">
            <bdi>{title}</bdi>
          </p>
          <p className={cn("text-xs", tone === "danger" ? "text-danger" : "text-muted")}>{detail}</p>
        </div>
        {busy && percent !== null && <span className="shrink-0 text-xs text-muted tabular-nums">{toPersianDigits(percent)}٪</span>}
        {action && (
          <button type="button" onClick={action.onClick} className="shrink-0 rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:bg-ink-800 hover:text-fg">
            {action.label}
          </button>
        )}
      </div>
      {busy && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700" dir="ltr">
          <div
            className={cn("h-full rounded-full bg-accent-strong transition-[width]", percent === null && "w-1/3 animate-pulse")}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
      )}
    </li>
  );
}

function ImportDialog({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const { busy, error, submit } = useSubmit(
    () => api("/api/movies/imports", { method: "POST", body: { url: url.trim(), name: name.trim() || null } }),
    () => {
      onStarted();
      onClose();
    },
  );
  return (
    <Modal title="دانلود فیلم از لینک" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">لینک فیلم</span>
          <input
            className="field"
            dir="ltr"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/film.mp4"
            required
            autoFocus
          />
          <span className="block text-xs leading-6 text-muted">
            لینک باید مستقیم به خود فایل MP4 یا WebM باشد، نه به صفحه‌ای که فیلم در آن است. سرور فیلم را خودش دانلود می‌کند و لازم نیست این صفحه باز بماند.
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            نام فیلم <span className="font-normal text-muted">(اختیاری)</span>
          </span>
          <input className="field" dir="auto" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="اگر خالی بماند، از نام فایل برداشته می‌شود" />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!url.trim()}>
          <Download className="size-4" />
          شروع دانلود
        </SubmitButton>
      </form>
    </Modal>
  );
}
