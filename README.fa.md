# صدامون (Sedaamon)

[English](README.md) · **فارسی**

صدامون یه برنامه‌ی گفت‌وگوی صوتی، تصویری و متنی شبیه دیسکورده که خودت روی سرور خودت اجراش می‌کنی. رابطش فارسی و راست‌چینه. موقع اجرا به هیچ سرویس بیرونی وابسته نیست: فونت، آیکون، رله‌ی صدا و تصویر و ورود، همه از خود سرور خودت میاد. برای همین حتی وقتی اینترنت بین‌الملل قطع باشه هم کار می‌کنه.

> وضعیت: نسخه‌ی اولیه (`0.x`). برای سازنده‌هاش توی محیط واقعی کار می‌کنه، ولی انتظار داشته باش بین نسخه‌ها تغییرهای ناسازگار بیاد و گوشه‌کنارش هنوز ناصاف باشه.

## امکانات

- ورود با شماره‌ی موبایل و کد پیامکی (کاوه‌نگار، یا چاپ توی لاگ برای توسعه)
- سرور، لینک دعوت، کانال متنی و صوتی، دسته‌بندی کانال‌ها و فهرست عمومی سرورها
- چت زنده (Socket.io): پاسخ، ویرایش، حذف، واکنش، سنجاق، منشن، فوروارد، «در حال تایپ» و استیکر
- عکس، فایل و پیام صوتی (نگه دار و حرف بزن)؛ ذخیره روی دیسک یا هر فضای S3 سازگار
- کانال صوتی و تصویری با دوربین، اشتراک صفحه، بی‌صدا و ناشنوا، روی [LiveKit](https://livekit.io)؛ حالت کم‌مصرف که تصویر رو قطع می‌کنه و صدا رو نگه می‌داره
- تماشای هم‌زمان، رویداد، صفحه‌ی خوش‌آمدگویی با قوانین، دوست و پیام خصوصی
- نقش و دسترسی: مالک، مدیر، نقش دلخواه، کانال خصوصی، بی‌صدا کردن، اخراج و مسدود کردن
- شمارنده‌ی پیام خوانده‌نشده و خط «پیام‌های جدید» که بین دستگاه‌ها هماهنگه؛ تنظیم اعلان برای هر سرور، کانال و گفتگو
- پنل مدیریت برای کسی که سرور رو اجرا می‌کنه (کاربر، سرور، کانال، پیام، آمار)
- تقویم شمسی، رابط فارسی، نصب به‌صورت PWA؛ برنامه‌ی دسکتاپ اختیاری برای مک و ویندوز ([desktop/](desktop/README.md))

## نصب سریع (داکر، سرور لینوکس)

یه سرور لینوکسی با داکر، یه دامنه و HTTPS لازم داری (مرورگر بدون HTTPS اجازه‌ی میکروفون و دوربین نمیده).

```bash
git clone https://github.com/TronIsHere/sedaamon.git && cd sedaamon
cp .env.example .env                           # ویرایشش کن: SITE_URL، ADMIN_PHONES، LIVEKIT_*، SMS_*
cp deploy/livekit.example.yaml livekit.yaml    # ویرایشش کن: node_ip، کلیدها، دامنه‌ی TURN
docker compose up -d --build
```

بعدش جلوش یه پراکسی با HTTPS بذار ([Caddy](deploy/Caddyfile.example) یا [nginx](deploy/nginx.conf)) و پورت‌های LiveKit رو توی فایروال باز کن. راهنمای کامل، از جمله نصب بدون داکر با PM2، توی **[docs/fa/installation.md](docs/fa/installation.md)** هست.

## اجرا روی سیستم خودت

پیش‌نیاز: Node نسخه‌ی ۲۲ به بالا، MongoDB روی `127.0.0.1:27017` و `livekit-server` (با `brew install livekit`).

```bash
cp .env.example .env.local
npm install
npm run livekit     # ترمینال اول
npm run dev         # ترمینال دوم
```

برو به <http://localhost:3000>. وقتی `SMS_PROVIDER=console` باشه، کد ورود روی صفحه‌ی ورود نشون داده میشه و توی لاگ سرور هم چاپ میشه. برای اینکه خودت مدیر بشی، شماره‌ات رو توی `ADMIN_PHONES` بذار.

## مستندات

| | English | فارسی |
|---|---|---|
| نصب و راه‌اندازی | [installation.md](docs/en/installation.md) | [installation.md](docs/fa/installation.md) |
| مرجع تنظیمات | [configuration.md](docs/en/configuration.md) | [configuration.md](docs/fa/configuration.md) |
| معماری | [architecture.md](docs/en/architecture.md) | [architecture.md](docs/fa/architecture.md) |
| نگهداری: پنل مدیریت، بکاپ، به‌روزرسانی | [administration.md](docs/en/administration.md) | [administration.md](docs/fa/administration.md) |
| امنیت و حریم خصوصی | [security.md](docs/en/security.md) | [security.md](docs/fa/security.md) |
| رفع اشکال | [troubleshooting.md](docs/en/troubleshooting.md) | [troubleshooting.md](docs/fa/troubleshooting.md) |

همین‌طور: [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [برنامه‌ی دسکتاپ](desktop/README.md)

## ساختار پروژه

| مسیر | چی توشه |
|---|---|
| `server.ts` | تنها پردازش برنامه: Next.js و Socket.io |
| `src/app/` | صفحه‌ها و مسیرهای API (`src/app/api/*`) |
| `src/components/` | رابط کاربری (`app/` خود برنامه‌ی چت، `admin/`، `landing/`، `onboarding/`) |
| `src/server/` | منطق سمت سرور: مدل‌ها، دسترسی‌ها، LiveKit، پیامک، ذخیره‌سازی، زنده |
| `src/lib/` | کدی که هم مرورگر استفاده می‌کنه هم سرور: نوع‌ها، تاریخ شمسی، جستجو، قواعد اعلان |
| `deploy/` | نمونه‌ی nginx، Caddy و LiveKit |
| `desktop/` | پوسته‌ی Tauri برای مک و ویندوز |
| `design/` | لوگو و منابع برند |

## تست

```bash
npm test            # تست‌های واحد
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/sedaamon_test npm test   # تست‌های دیتابیس هم
npm run typecheck && npm run lint
```

تست‌های دیتابیس کنار اسمی که بدی دیتابیس خودشون رو می‌سازن و پاک می‌کنن؛ پس اون رو به یه MongoDB آزمایشی وصل کن.

## مجوز

هنوز فایل مجوزی (license) اضافه نشده. صاحب پروژه باید قبل از استفاده‌ی دیگران از کد یکی رو انتخاب کنه؛ [CONTRIBUTING.md](CONTRIBUTING.md#license) رو ببین.
