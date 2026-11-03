"use client";

import { useState } from "react";
import { Globe, Hash, Lock, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import { CATEGORIES, cleanTags, MAX_DESCRIPTION, MAX_TAG_LENGTH, MAX_TAGS, MIN_DESCRIPTION } from "@/lib/discovery";
import { cn } from "@/lib/format";
import { toPersianDigits } from "@/lib/phone";
import type { ChannelDTO, DiscoverySettingsDTO, ServerDetailDTO, ServerDTO, WelcomeDTO } from "@/lib/types";
import { inputClass, SubmitButton, useSubmit } from "./Dialogs";

const MAX_RULES = 10;
const MAX_STARTERS = 5;

interface Props<T> {
  server: ServerDTO;
  value: T;
  onChanged: (detail: ServerDetailDTO) => void;
  onNotify: (message: string) => void;
}

function ToggleRow({ checked, onChange, icon, title, hint }: { checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5", checked ? "border-accent bg-accent-strong/10" : "border-line hover:bg-ink-800")}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <span role="presentation" className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-accent-strong" : "bg-ink-700")}>
        <span className={cn("absolute top-1 size-4 rounded-full shadow transition-all", checked ? "start-6 bg-on-accent" : "start-1 bg-white")} />
      </span>
    </label>
  );
}

/** Whether and how the server appears in the public directory. */
export function DiscoverySettings({ server, value, onChanged, onNotify }: Props<DiscoverySettingsDTO>) {
  const [isPublic, setIsPublic] = useState(value.isPublic);
  const [description, setDescription] = useState(value.description);
  const [category, setCategory] = useState(value.category);
  const [tags, setTags] = useState(value.tags);
  const [tagDraft, setTagDraft] = useState("");

  const addTag = () => {
    setTags(cleanTags([...tags, ...tagDraft.split(/[,،]/)]));
    setTagDraft("");
  };

  const { busy, error, submit } = useSubmit(
    () => api<ServerDetailDTO>(`/api/servers/${server.id}`, { method: "PATCH", body: { discovery: { isPublic, description, category, tags: cleanTags([...tags, tagDraft]) } } }),
    (detail) => {
      setTagDraft("");
      onChanged(detail);
      onNotify(isPublic ? "سرور در فهرست عمومی قرار گرفت" : "تنظیمات کاوش ذخیره شد");
    },
  );
  const tooShort = isPublic && description.trim().length < MIN_DESCRIPTION;

  return (
    <form onSubmit={submit} className="space-y-4">
      <ToggleRow
        checked={isPublic}
        onChange={setIsPublic}
        icon={<Globe className="size-5" />}
        title="نمایش در فهرست عمومی"
        hint="همه می‌توانند سرور را در بخش «کاوش» پیدا کنند و بدون لینک دعوت بپیوندند"
      />

      <label className="block space-y-1.5">
        <span className="flex justify-between text-sm text-muted">
          توضیح سرور
          <span className="text-xs">
            {toPersianDigits(description.length)}/{toPersianDigits(MAX_DESCRIPTION)}
          </span>
        </span>
        <textarea
          dir="auto"
          rows={3}
          maxLength={MAX_DESCRIPTION}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="این سرور دربارهٔ چیست و چه کسانی به آن می‌پیوندند؟"
          className={cn(inputClass, "resize-none leading-7")}
        />
        {tooShort && <span className="text-xs text-amber-300">برای نمایش در فهرست، دست‌کم {toPersianDigits(MIN_DESCRIPTION)} حرف بنویسید</span>}
      </label>

      <fieldset className="space-y-1.5">
        <legend className="text-sm text-muted">دسته‌بندی</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label key={c.id} className={cn("cursor-pointer rounded-full border px-3 py-1 text-sm", category === c.id ? "border-accent bg-accent-strong/10" : "border-line text-muted hover:bg-ink-800")}>
              <input type="radio" name="category" className="sr-only" checked={category === c.id} onChange={() => setCategory(c.id)} />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <span className="flex justify-between text-sm text-muted">
          برچسب‌ها
          <span className="text-xs">
            {toPersianDigits(tags.length)}/{toPersianDigits(MAX_TAGS)}
          </span>
        </span>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-ink-850 py-0.5 ps-2.5 pe-1 text-xs ring-1 ring-line">
                #{t}
                <button type="button" aria-label={`حذف ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} className="grid size-5 place-items-center rounded-full text-muted hover:text-fg">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          className={inputClass}
          value={tagDraft}
          maxLength={MAX_TAG_LENGTH}
          disabled={tags.length >= MAX_TAGS}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={() => tagDraft.trim() && addTag()}
          placeholder="برچسب را بنویسید و Enter بزنید"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <SubmitButton busy={busy} disabled={tooShort}>
        ذخیره
      </SubmitButton>
    </form>
  );
}

/** The greeting, rules and starter channels a new member goes through. */
export function WelcomeSettings({ server, value, channels, onChanged, onNotify }: Props<WelcomeDTO> & { channels: ChannelDTO[] }) {
  const [enabled, setEnabled] = useState(value.enabled);
  const [title, setTitle] = useState(value.title);
  const [message, setMessage] = useState(value.message);
  const [rules, setRules] = useState(value.rules.join("\n"));
  const [requireRules, setRequireRules] = useState(value.requireRules);
  const [channelIds, setChannelIds] = useState(value.channelIds);

  const ruleList = rules.split("\n").map((r) => r.trim()).filter(Boolean);
  const tooMany = ruleList.length > MAX_RULES;
  const needsRules = enabled && requireRules && !ruleList.length;

  const toggleChannel = (id: string) => setChannelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < MAX_STARTERS ? [...ids, id] : ids));

  const { busy, error, submit } = useSubmit(
    () =>
      api<ServerDetailDTO>(`/api/servers/${server.id}`, {
        method: "PATCH",
        body: { welcome: { enabled, title, message, rules: ruleList, requireRules, channelIds } },
      }),
    (detail) => {
      onChanged(detail);
      onNotify(enabled ? "پیام خوش‌آمدگویی ذخیره شد" : "پیام خوش‌آمدگویی خاموش شد");
    },
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <ToggleRow
        checked={enabled}
        onChange={setEnabled}
        icon={<Hash className="size-5" />}
        title="خوش‌آمدگویی به اعضای تازه"
        hint="هر کس که می‌پیوندد این صفحه را می‌بیند و یک هفته نشان «عضو جدید» می‌گیرد"
      />

      <fieldset disabled={!enabled} className={cn("space-y-4", !enabled && "opacity-50")}>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted">عنوان</span>
          <input className={inputClass} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={`به ${server.name} خوش آمدید`} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-muted">پیام</span>
          <textarea dir="auto" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="چند جمله دربارهٔ سرور و کارهایی که می‌شود کرد" className={cn(inputClass, "resize-none leading-7")} />
        </label>

        <label className="block space-y-1.5">
          <span className="flex justify-between text-sm text-muted">
            قوانین (هر قانون در یک خط)
            <span className={cn("text-xs", tooMany && "text-danger")}>
              {toPersianDigits(ruleList.length)}/{toPersianDigits(MAX_RULES)}
            </span>
          </span>
          <textarea dir="auto" rows={5} value={rules} onChange={(e) => setRules(e.target.value)} placeholder={"با دیگران محترمانه رفتار کنید\nتبلیغات ممنوع است"} className={cn(inputClass, "resize-none leading-7")} />
        </label>

        <ToggleRow
          checked={requireRules}
          onChange={setRequireRules}
          icon={<Lock className="size-5" />}
          title="پذیرش قوانین الزامی باشد"
          hint="تا قوانین را نپذیرند، فقط می‌توانند بخوانند. اعضای فعلی تغییری نمی‌کنند"
        />

        <fieldset className="space-y-1.5">
          <legend className="text-sm text-muted">
            کانال‌های شروع
            <span className="ms-1 text-xs">
              ({toPersianDigits(channelIds.length)}/{toPersianDigits(MAX_STARTERS)})
            </span>
          </legend>
          <p className="text-xs leading-5 text-muted">اعضای تازه به این کانال‌ها هدایت می‌شوند. کانال خصوصی انتخاب‌شده به هر عضو تازه باز می‌شود.</p>
          <ul className="scrollbar-thin max-h-44 space-y-0.5 overflow-y-auto rounded-xl bg-ink-850 p-1.5 ring-1 ring-line">
            {channels.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink-850">
                  <input type="checkbox" className="size-4 accent-[var(--color-accent-strong)]" checked={channelIds.includes(c.id)} onChange={() => toggleChannel(c.id)} />
                  {c.type === "text" ? <Hash className="size-4 shrink-0 text-muted" /> : <Volume2 className="size-4 shrink-0 text-muted" />}
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  {c.isPrivate && <Lock className="size-3.5 shrink-0 text-muted" aria-label="کانال خصوصی" />}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </fieldset>

      {needsRules && <p className="text-xs text-amber-300">برای الزام پذیرش قوانین، دست‌کم یک قانون بنویسید</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <SubmitButton busy={busy} disabled={tooMany || needsRules}>
        ذخیره
      </SubmitButton>
    </form>
  );
}
