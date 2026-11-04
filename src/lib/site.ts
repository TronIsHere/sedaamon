import type { Metadata } from "next";

/**
 * Who the site is and what it says about itself. Page metadata, structured data, the sitemap and
 * llms.txt all read from here, so search engines, AI assistants and the landing page tell the same story.
 */

// The public origin. Set SITE_URL when the site moves to its final domain.
export const SITE_URL = (process.env.SITE_URL || "https://seda.arzhaam.ir").replace(/\/$/, "");

export const SITE = {
  name: "صدامون",
  // The Latin spelling, so assistants that answer in English can tie the name to this site.
  nameEn: "Sedaamon",
  title: "صدامون | تماس صوتی و تصویری گروهی بدون فیلترشکن",
  tagline: "سرورهای صوتی، تصویری و متنی روی شبکه‌ی داخلی",
  description:
    "صدامون سرورهای صوتی، تصویری و متنی برای دوستان، کلاس‌ها و جمع‌های بازی است که روی شبکه‌ی داخلی اجرا می‌شود؛ بدون فیلترشکن و حتی با قطع اینترنت بین‌الملل.",
  descriptionEn:
    "Sedaamon is a Persian, right-to-left voice, video and text chat platform with Discord-style servers and channels. It runs entirely on servers inside Iran, so it works without a VPN and keeps working when international internet access is cut.",
  // Set to show a contact line on the about and privacy pages and in the Organization schema.
  contactEmail: process.env.SITE_CONTACT_EMAIL || undefined,
  // Bump when the public pages change; the sitemap reports it as lastModified.
  updated: "2026-11-05",
};

export const FEATURES = [
  "تماس صوتی",
  "تماس تصویری",
  "اشتراک صفحه",
  "تماشای هم‌زمان",
  "استیکر",
  "رویدادها",
  "پیام سنجاق‌شده",
  "نقش‌ها",
  "کشف سرورها",
];

export const STEPS = [
  { title: "یک سرور بسازید", text: "برای جمعتان کانال متنی و صوتی جدا بسازید.", tag: "سرور و کانال" },
  { title: "دوستانتان را دعوت کنید", text: "لینک دعوت را بفرستید؛ ورود فقط با شماره‌ی موبایل است.", tag: "لینک دعوت" },
  { title: "وارد کانال صوتی شوید", text: "حرف بزنید، دوربین را روشن کنید یا صفحه‌تان را نشان دهید.", tag: "صدا و تصویر" },
];

export const FAQ = [
  {
    q: "صدامون چیست؟",
    a: "صدامون یک برنامه‌ی گفت‌وگوی گروهی فارسی است. هر جمع یک سرور می‌سازد و در آن کانال‌های متنی و صوتی دارد؛ می‌شود پیام و استیکر فرستاد، تماس صوتی و تصویری گرفت، صفحه را به اشتراک گذاشت و فیلم را هم‌زمان تماشا کرد.",
  },
  {
    q: "برای استفاده از صدامون فیلترشکن لازم است؟",
    a: "نه. صدامون روی سرورهای داخل ایران اجرا می‌شود. ورود، پیام‌ها، صدا و تصویر و حتی فونت‌ها و آیکون‌ها همه از همان سرور می‌آیند، پس با قطع اینترنت بین‌الملل هم کار می‌کند.",
  },
  {
    q: "صدامون با دیسکورد چه فرقی دارد؟",
    a: "صدامون هم مثل دیسکورد سرور، کانال متنی، کانال صوتی و نقش دارد، اما روی شبکه‌ی داخلی اجرا می‌شود، از اول فارسی و راست‌چین ساخته شده، تاریخ‌هایش شمسی است و ورود با شماره‌ی موبایل انجام می‌شود.",
  },
  {
    q: "چطور حساب بسازم؟",
    a: "شماره‌ی موبایلتان را وارد کنید تا یک کد پیامکی برایتان بیاید. بعد از واردکردن کد، فقط یک نام انتخاب می‌کنید و آماده‌اید.",
  },
  {
    q: "اگر اینترنتم ضعیف باشد چه می‌شود؟",
    a: "حالت کم‌مصرف را روشن کنید. در این حالت تصویر دیگران دریافت نمی‌شود و صدا بدون قطعی ادامه پیدا می‌کند.",
  },
  {
    q: "روی موبایل و کامپیوتر هم کار می‌کند؟",
    a: "بله. صدامون در مرورگر موبایل و کامپیوتر باز می‌شود و نصب لازم ندارد. می‌توانید آن را به صفحه‌ی اصلی گوشی اضافه کنید تا مثل یک برنامه اجرا شود.",
  },
  {
    q: "چه کسی می‌تواند کانال بسازد یا عضوی را بیرون کند؟",
    a: "هر سرور یک مالک دارد. مالک مدیر تعیین می‌کند و مدیرها کانال‌ها را می‌سازند، پیام پاک می‌کنند و اعضای پایین‌تر از خودشان را بی‌صدا یا اخراج می‌کنند.",
  },
  {
    q: "سرورهای عمومی را کجا پیدا کنم؟",
    a: "در بخش کشف سرورها، سرورهای عمومی بر اساس دسته‌هایی مثل بازی، موسیقی و آموزش فهرست شده‌اند و با یک کلیک عضو می‌شوید.",
  },
];

/** The public pages, for the sitemap, llms.txt and the footer. */
export const PAGES = [
  { path: "/", title: "صفحه‌ی اصلی", about: "معرفی صدامون، امکانات، شروع کار و پرسش‌های پرتکرار" },
  { path: "/about", title: "درباره‌ی صدامون", about: "صدامون چیست، برای چه ساخته شده و چطور کار می‌کند" },
  { path: "/signup", title: "ثبت‌نام", about: "ساخت حساب با شماره‌ی موبایل" },
  { path: "/privacy", title: "حریم خصوصی", about: "چه اطلاعاتی نگه می‌داریم و کجا" },
  { path: "/terms", title: "قوانین استفاده", about: "قواعد استفاده از صدامون" },
];

/**
 * Metadata for a public page. Next.js merges metadata shallowly, and a page that sets openGraph also
 * drops the inherited app/opengraph-image.png, so the image is named again here.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  const fullTitle = `${title} · ${SITE.name}`;
  const images = [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: SITE.title }];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "fa_IR", siteName: SITE.name, url: path, title: fullTitle, description, images },
    twitter: { card: "summary_large_image", title: fullTitle, description, images },
  };
}

/** Structured data as a script tag body; `<` is escaped so text can never close the tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
