"use client";

import { AtSign, BellOff, Reply, Users } from "lucide-react";
import { cn, formatAgo } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { NotificationDTO, NotificationKind } from "@/lib/types";
import Skeleton from "@/components/ui/skeleton";
import Avatar from "./Avatar";
import { Modal } from "./Dialogs";

export const PING_TEXT: Record<NotificationKind, string> = {
  mention: "شما را صدا زد",
  everyone: "همه را صدا زد",
  reply: "به پیام شما پاسخ داد",
};

export const PING_ICON = { mention: AtSign, everyone: Users, reply: Reply } as const;

/** Everything that pinged you lately: mentions, @everyone and replies. Tapping one opens the channel it came from. */
export default function NotificationsDialog({
  notifications,
  onOpen,
  onReadAll,
  onClear,
  onClose,
}: {
  notifications: NotificationDTO[] | null;
  onOpen: (n: NotificationDTO) => void;
  onReadAll: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const unread = notifications?.filter((n) => !n.read).length ?? 0;

  return (
    <Modal title="اعلان‌ها" onClose={onClose}>
      {!notifications ? (
        <div className="space-y-3 py-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-3 w-40 rounded-full" />
            </div>
          ))}
        </div>
      ) : notifications.length ? (
        <>
          <ul className="-mx-2 max-h-[55dvh] space-y-0.5 overflow-y-auto">
            {notifications.map((n) => {
              const Icon = PING_ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    onClick={() => onOpen(n)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start hover:bg-ink-850",
                      !n.read && "bg-accent/10 hover:bg-accent/15",
                    )}
                  >
                    <Avatar user={n.author} />
                    <span className="min-w-0 flex-1 leading-6">
                      <span className="flex items-center gap-1.5 text-sm">
                        <Icon className="size-3.5 shrink-0 text-accent ltr:-scale-x-100" />
                        <span className="min-w-0 truncate">
                          <span className="font-semibold">{n.author.name}</span> {PING_TEXT[n.kind]}
                        </span>
                        {!n.read && <span className="ms-auto size-2 shrink-0 rounded-full bg-accent" aria-label="خوانده‌نشده" />}
                      </span>
                      <span dir="auto" className="block truncate text-sm text-muted">
                        {n.preview}
                      </span>
                      <span className="block truncate text-xs text-muted/80">
                        #{n.channelName} · {n.serverName} · {formatAgo(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={onReadAll}
              disabled={!unread}
              className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted enabled:hover:text-fg disabled:opacity-50"
            >
              خوانده شد{unread > 0 && ` (${toPersianDigits(unread)})`}
            </button>
            <button onClick={onClear} className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-muted hover:text-danger">
              پاک کردن همه
            </button>
          </div>
        </>
      ) : (
        <div className="py-10 text-center text-muted">
          <BellOff className="mx-auto size-8" />
          <p className="mt-3 text-sm leading-7">
            اعلانی ندارید.
            <br />
            وقتی کسی شما را با @ صدا بزند یا به پیامتان پاسخ دهد، اینجا می‌بینید.
          </p>
        </div>
      )}
    </Modal>
  );
}
