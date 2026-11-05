"use client";

import { useEffect, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { BanDTO, ServerDTO } from "@/lib/types";
import Avatar from "./Avatar";

/** Everyone banned from the server, with who banned them and why, and a way to let each one back. */
export default function BansSettings({ server, onNotify }: { server: ServerDTO; onNotify: (message: string) => void }) {
  const [bans, setBans] = useState<BanDTO[] | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ bans: BanDTO[] }>(`/api/servers/${server.id}/bans`)
      .then((res) => setBans(res.bans))
      .catch((err) => setError(err.message));
  }, [server.id]);

  const unban = async (ban: BanDTO) => {
    setBusy(ban.user.id);
    try {
      await api(`/api/servers/${server.id}/bans/${ban.user.id}`, { method: "DELETE" });
      setBans((list) => list && list.filter((b) => b.user.id !== ban.user.id));
      onNotify(`${ban.user.name} از مسدودی درآمد و می‌تواند با لینک دعوت برگردد`);
    } catch (err) {
      onNotify((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="py-8 text-center text-sm text-danger">{error}</p>;
  if (!bans)
    return (
      <div className="grid place-items-center py-12 text-muted">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  if (!bans.length)
    return (
      <div className="py-10 text-center text-sm leading-7 text-muted">
        <Ban className="mx-auto mb-3 size-8 opacity-60" />
        کسی از این سرور مسدود نشده است.
        <br />
        برای مسدود کردن، روی نام عضو بزنید.
      </div>
    );

  return (
    <ul className="scrollbar-thin max-h-[60vh] space-y-1 overflow-y-auto">
      {bans.map((b) => (
        <li key={b.user.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-850">
          <Avatar user={b.user} />
          <div className="min-w-0 flex-1 leading-5">
            <p className="truncate text-sm font-semibold">{b.user.name}</p>
            <p className="truncate text-xs text-muted">
              {formatDate(b.createdAt)}
              {b.by && ` · توسط ${b.by.name}`}
            </p>
            {b.reason && (
              <p dir="auto" className="truncate text-xs text-fg/70">
                {b.reason}
              </p>
            )}
          </div>
          <button
            disabled={busy === b.user.id}
            onClick={() => unban(b)}
            className="shrink-0 rounded-full bg-ink-800 px-3 py-1.5 text-xs font-semibold hover:bg-ink-700 disabled:opacity-60"
          >
            {busy === b.user.id ? <Loader2 className="size-3.5 animate-spin" /> : "رفع مسدودی"}
          </button>
        </li>
      ))}
    </ul>
  );
}
