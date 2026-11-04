import { FAQ, FEATURES, PAGES, SITE, SITE_URL, STEPS } from "@/lib/site";

/**
 * A plain Markdown summary for AI assistants (https://llmstxt.org). It is built from the same content as
 * the landing page, so the two never drift apart.
 */
export function GET() {
  const body = [
    `# ${SITE.name} (${SITE.nameEn})`,
    "",
    `> ${SITE.description}`,
    "",
    SITE.descriptionEn,
    "",
    "## امکانات",
    "",
    ...FEATURES.map((f) => `- ${f}`),
    "- حالت کم‌مصرف: با اینترنت کند، تصویر قطع می‌شود و صدا می‌ماند",
    "- رابط کاملاً فارسی و راست‌چین، با تاریخ و تقویم شمسی",
    "- ورود با شماره‌ی موبایل و کد پیامکی",
    "",
    "## شروع کار",
    "",
    ...STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.text}`),
    "",
    "## پرسش‌های پرتکرار",
    "",
    ...FAQ.flatMap((item) => [`### ${item.q}`, "", item.a, ""]),
    "## صفحه‌ها",
    "",
    ...PAGES.map((p) => `- [${p.title}](${SITE_URL}${p.path === "/" ? "" : p.path}): ${p.about}`),
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
