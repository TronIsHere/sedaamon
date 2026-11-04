import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { Contact, Section } from "@/components/landing/InfoPage";
import { SITE, SITE_URL, pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "صدامون چیست و چرا ساخته شد؛ برنامه‌ی گفت‌وگوی گروهی فارسی با سرور، کانال صوتی و تماس تصویری که کاملاً روی شبکه‌ی داخلی ایران اجرا می‌شود.";

export const metadata: Metadata = pageMetadata("/about", "درباره‌ی صدامون", DESCRIPTION);

export default function AboutPage() {
  return (
    <InfoPage
      title="درباره‌ی صدامون"
      lead={SITE.description}
      schema={{
        "@context": "https://schema.org",
        "@type": "AboutPage",
        url: `${SITE_URL}/about`,
        name: "درباره‌ی صدامون",
        description: DESCRIPTION,
        inLanguage: "fa-IR",
        about: { "@id": `${SITE_URL}/#organization` },
        isPartOf: { "@id": `${SITE_URL}/#website` },
      }}
    >
      <Section title="صدامون چیست؟">
        <p>
          صدامون ({SITE.nameEn}) یک برنامه‌ی گفت‌وگوی گروهی فارسی است. هر جمع یک <strong>سرور</strong> می‌سازد و
          در آن کانال‌های متنی و صوتی دارد. اعضا پیام، استیکر و پیام صوتی می‌فرستند، تماس صوتی و تصویری می‌گیرند،
          صفحه‌شان را به اشتراک می‌گذارند و فیلم را هم‌زمان تماشا می‌کنند.
        </p>
        <p>
          صدامون در مرورگر موبایل و کامپیوتر باز می‌شود و نصب لازم ندارد. ورود فقط با شماره‌ی موبایل و یک کد
          پیامکی انجام می‌شود.
        </p>
      </Section>

      <Section title="چرا روی شبکه‌ی داخلی؟">
        <p>
          سرورهای بیشتر برنامه‌های گفت‌وگوی گروهی بیرون از ایران است. وقتی اینترنت بین‌الملل کند یا قطع می‌شود،
          جمع‌های دوستانه، کلاس‌ها و گروه‌های بازی هم از هم جدا می‌شوند. صدامون ساخته شد تا این جمع‌ها
          <strong> بدون فیلترشکن و حتی با قطع اینترنت بین‌الملل</strong> سرپا بمانند.
        </p>
      </Section>

      <Section title="صدامون چطور کار می‌کند؟">
        <ul>
          <li>
            <strong>همه‌چیز روی سرورهای داخل ایران است:</strong> ورود، پیام‌ها، تماس‌های صوتی و تصویری و
            فایل‌ها، و حتی فونت‌ها و آیکون‌های رابط از همان سرور می‌آیند.
          </li>
          <li>
            <strong>تماس‌ها با WebRTC</strong> برقرار می‌شوند و از سرور رسانه‌ای خود صدامون می‌گذرند؛ ضبط نمی‌شوند.
          </li>
          <li>
            <strong>حالت کم‌مصرف</strong> با اینترنت ضعیف تصویر دیگران را قطع می‌کند تا صدا بدون قطعی ادامه پیدا کند.
          </li>
          <li>
            <strong>تماشای هم‌زمان</strong> فیلم را آپلود نمی‌کند؛ هر نفر فایل خودش را پخش می‌کند و فقط فرمان پخش،
            توقف و جابه‌جایی رد و بدل می‌شود.
          </li>
          <li>
            <strong>رابط از اول فارسی و راست‌چین</strong> ساخته شده و رویدادها با تقویم شمسی برنامه‌ریزی می‌شوند.
          </li>
          <li>
            <strong>نقش‌ها</strong> (مالک، مدیر، ناظر و نقش‌های دلخواه) نظم هر سرور را دست خود اعضا می‌دهند.
          </li>
        </ul>
      </Section>

      <Section title="صدامون برای چه کسانی است؟">
        <ul>
          <li>
            <strong>جمع‌های بازی</strong> که شب‌ها در کانال صوتی دور هم جمع می‌شوند و صفحه‌ی بازی را به اشتراک
            می‌گذارند.
          </li>
          <li>
            <strong>کلاس‌ها و گروه‌های مطالعه</strong> که جلسه را در کانال تصویری برگزار و جلسه‌ی بعد را در رویدادها
            اعلام می‌کنند.
          </li>
          <li>
            <strong>دوستان و خانواده</strong> که می‌خواهند با هم حرف بزنند و فیلم آخر هفته را با هم ببینند.
          </li>
        </ul>
        <p>
          برای شروع،{" "}
          <Link href="/signup" className="text-(--lime) underline-offset-4 hover:underline">
            با شماره‌ی موبایلتان ثبت‌نام کنید
          </Link>
          ؛ ساخت حساب یک دقیقه طول می‌کشد.
        </p>
      </Section>

      {SITE.contactEmail && (
        <Section title="ارتباط با ما">
          <Contact>پرسش، پیشنهاد یا گزارش مشکل را به این نشانی بفرستید:</Contact>
        </Section>
      )}
    </InfoPage>
  );
}
