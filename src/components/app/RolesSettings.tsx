"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronLeft, Crown, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { can, canManageRole, OWNER_LABEL, PERMISSION_INFO, ROLE_COLORS, ROLE_PERMISSIONS, type Standing } from "@/lib/permissions";
import { toPersianDigits } from "@/lib/phone";
import type { MemberDTO, RoleDTO, ServerDTO } from "@/lib/types";
import { inputClass, SubmitButton, useSubmit } from "./Dialogs";
import { ToggleRow } from "./ServerOnboardingSettings";

/**
 * The server's roles, strongest first: make new ones, reorder them, and set each one's name, colour and permissions.
 * Only roles below your own can be touched (the owner can touch all). Changes reach every open screen through the
 * server's "roles:changed" event, which refetches the server, so this list never keeps a copy of its own.
 */
export default function RolesSettings({
  server,
  roles,
  members,
  onNotify,
}: {
  server: ServerDTO;
  roles: RoleDTO[];
  members: MemberDTO[];
  onNotify: (message: string) => void;
}) {
  const me = server.standing;
  /** The role being edited, "new" for one not made yet, or null for the list. */
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const count = (role: RoleDTO) => members.filter((m) => m.roles.includes(role.id)).length;

  const move = async (role: RoleDTO, direction: "up" | "down") => {
    setMoving(role.id);
    try {
      await api(`/api/servers/${server.id}/roles/${role.id}`, { method: "PATCH", body: { move: direction } });
    } catch (err) {
      onNotify((err as Error).message);
    }
    setMoving(null);
  };

  const open = editing === "new" ? null : roles.find((r) => r.id === editing);
  if (editing === "new" || open) {
    return <RoleEditor key={editing} server={server} me={me} role={open ?? null} onBack={() => setEditing(null)} onNotify={onNotify} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-6 text-muted">
        هر عضو می‌تواند چند نقش داشته باشد و همهٔ اختیارات آن‌ها را می‌گیرد. نقش‌های بالاتر بر پایین‌تری‌ها برتری دارند: فقط نقش‌ها و اعضای پایین‌تر از
        بالاترین نقش خودتان را می‌توانید مدیریت کنید.
      </p>

      {can(me, "role:manage") && (
        <button onClick={() => setEditing("new")} className="btn-primary w-full">
          <Plus className="size-4" />
          نقش تازه
        </button>
      )}

      <ul className="space-y-1.5">
        <li className="flex items-center gap-3 rounded-xl bg-ink-850 px-3 py-2.5 ring-1 ring-line">
          <Crown className="size-4 shrink-0 text-amber-400" />
          <span className="flex-1 text-sm font-semibold">{OWNER_LABEL}</span>
          <span className="text-xs text-muted">همهٔ اختیارات</span>
        </li>
        {roles.map((r, i) => {
          const manageable = canManageRole(me, r);
          // Moving up passes the role above, which must be manageable too.
          const canUp = manageable && i > 0 && canManageRole(me, roles[i - 1]);
          const canDown = manageable && i < roles.length - 1;
          return (
            <li key={r.id} className="flex items-center gap-1 rounded-xl bg-ink-850 ps-3 pe-1 ring-1 ring-line">
              <button
                onClick={() => setEditing(r.id)}
                disabled={!manageable}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-start disabled:cursor-default"
              >
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="min-w-0 flex-1 leading-5">
                  <span className="block truncate text-sm font-semibold" style={{ color: r.color }}>
                    {r.name}
                  </span>
                  <span className="block text-xs text-muted">
                    {toPersianDigits(count(r))} عضو · {toPersianDigits(r.permissions.length)} اختیار
                  </span>
                </span>
                {manageable ? <ChevronLeft className="size-4 shrink-0 text-muted ltr:rotate-180" /> : <Lock className="size-4 shrink-0 text-muted" aria-label="بالاتر از نقش شما" />}
              </button>
              {manageable && (
                <span className="flex shrink-0">
                  {moving === r.id ? (
                    <Loader2 className="m-2.5 size-4 animate-spin text-muted" />
                  ) : (
                    <>
                      <IconButton label="بالاتر" disabled={!canUp} onClick={() => move(r, "up")}>
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton label="پایین‌تر" disabled={!canDown} onClick={() => move(r, "down")}>
                        <ArrowDown className="size-4" />
                      </IconButton>
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
        {!roles.length && <li className="py-6 text-center text-sm text-muted">این سرور هنوز نقشی ندارد</li>}
      </ul>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-ink-800 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RoleEditor({
  server,
  me,
  role,
  onBack,
  onNotify,
}: {
  server: ServerDTO;
  me: Standing;
  /** Null while making a new role. */
  role: RoleDTO | null;
  onBack: () => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState(role?.color ?? ROLE_COLORS[0]);
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const path = role ? `/api/servers/${server.id}/roles/${role.id}` : `/api/servers/${server.id}/roles`;
  const { busy, error, submit } = useSubmit(
    () => api(path, role ? { method: "PATCH", body: { name, color, permissions } } : { body: { name, color, permissions } }),
    () => {
      onNotify(role ? "نقش ذخیره شد" : "نقش ساخته شد");
      // A new role shows up at the bottom of the list once the server is fetched again.
      if (!role) onBack();
    },
  );
  const dirty = !role || name.trim() !== role.name || color !== role.color || [...permissions].sort().join() !== [...role.permissions].sort().join();

  const remove = async () => {
    if (!role) return;
    setDeleting(true);
    try {
      await api(path, { method: "DELETE" });
      onNotify(`نقش «${role.name}» حذف شد`);
      onBack();
    } catch (err) {
      onNotify((err as Error).message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        همهٔ نقش‌ها
      </button>

      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">نام نقش</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoFocus={!role} style={{ color }} />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-sm text-muted">رنگ</legend>
          <div className="flex flex-wrap gap-2">
            {ROLE_COLORS.map((c) => (
              <label key={c} className={cn("cursor-pointer rounded-full", color === c && "ring-2 ring-fg ring-offset-2 ring-offset-ink-900")} title={c}>
                <input type="radio" name="role-color" className="sr-only" checked={color === c} onChange={() => setColor(c)} aria-label={c} />
                <span className="grid size-8 place-items-center rounded-full" style={{ backgroundColor: c }}>
                  {color === c && <Check className="size-4 text-ink-950" />}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm text-muted">اختیارات</legend>
          {ROLE_PERMISSIONS.map((p) => {
            const on = permissions.includes(p);
            // You can't give a power you don't have; one the role already has can still be taken away.
            const locked = !on && !can(me, p);
            return (
              <ToggleRow
                key={p}
                checked={on}
                disabled={locked}
                onChange={(v) => setPermissions(v ? [...permissions, p] : permissions.filter((x) => x !== p))}
                title={PERMISSION_INFO[p].label}
                hint={locked ? "این اختیار را خودتان ندارید" : PERMISSION_INFO[p].hint}
              />
            );
          })}
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}
        <SubmitButton busy={busy} disabled={!name.trim() || !dirty}>
          {role ? "ذخیره" : "ساختن نقش"}
        </SubmitButton>
      </form>

      {role && (
        <div className="border-t border-line pt-4">
          {confirmDelete ? (
            <div className="rounded-xl bg-danger/10 p-3">
              <p className="mb-2 text-sm leading-6">نقش «{role.name}» حذف شود؟ از همهٔ اعضایی که آن را دارند گرفته می‌شود.</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={remove}
                  disabled={deleting}
                  className="rounded-xl bg-danger-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-danger-strong/90 disabled:opacity-60"
                >
                  حذف نقش
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted hover:text-fg">
                  انصراف
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10">
              <Trash2 className="size-4" />
              حذف نقش
            </button>
          )}
        </div>
      )}
    </div>
  );
}
