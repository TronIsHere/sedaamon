# نصب و راه‌اندازی

دو راه برای اجرای صدامون روی سرور داری: **داکر کامپوز** (پیشنهادی) یا **مستقیم با Node و PM2**. هر دو سه چیز بیرونی لازم دارن: یه دامنه با HTTPS، یه سرویس پیامک برای کد ورود، و پورت‌های باز برای صدا.

فهرست: [چی لازمه](#چی-لازمه) · [دی‌ان‌اس و HTTPS](#دیاناس-و-https) · [روش اول: داکر](#روش-اول-داکر-کامپوز) · [روش دوم: Node و PM2](#روش-دوم-node-و-pm2) · [پراکسی](#پراکسی) · [فایروال](#فایروال) · [اولین ورود](#اولین-ورود) · [چک کن که کار می‌کنه](#چک-کن-که-کار-میکنه)

## چی لازمه

| چیز | توضیح |
|---|---|
| سرور لینوکس | مستندات روی اوبونتو ۲۲.۰۴ به بالا نوشته شده. برای گروه‌های کوچیک ۲ هسته و ۲ گیگ رم کافیه. صدا و تصویر پهنای آپلود می‌خوان: هر شنونده صدای همه‌ی گوینده‌ها رو می‌گیره (حدود ۳۰ تا ۵۰ کیلوبیت بر ثانیه برای هر جریان). تصویر و اشتراک صفحه خیلی بیشتر مصرف می‌کنن. |
| آی‌پی عمومی | LiveKit همین رو به مرورگرها میده (`node_ip`). |
| دامنه | دو اسم که به سرور اشاره کنن: خود برنامه (`example.com`) و سیگنالینگ LiveKit (`rtc.example.com`). اگه TURN می‌خوای یه اسم سوم هم (`turn.example.com`). |
| گواهی HTTPS | مرورگر روی HTTP ساده میکروفون و دوربین رو نمیده. |
| MongoDB نسخه‌ی ۷ | توی نصب داکر خودش هست. |
| سرویس پیامک | [کاوه‌نگار](https://kavenegar.com) آماده توی برنامه هست. بدون اون، کد ورود فقط توی لاگ سرور میاد. |
| Node نسخه‌ی ۲۲ به بالا | فقط برای روش دوم. |

## دی‌ان‌اس و HTTPS

برای `example.com` و `rtc.example.com` (و اگه TURN می‌خوای `turn.example.com`) رکورد `A` بساز که به سرور اشاره کنه.

گواهی رو از هر جا که دوست داری بگیر. اگه سرورت به Let's Encrypt دسترسی داره، [Caddy](../../deploy/Caddyfile.example) همه‌اش رو خودکار انجام میده. اگه نه (مثلاً توی شبکه‌ی محدود)، از یه مرجع گواهی داخلی و [تنظیمات nginx](../../deploy/nginx.conf) استفاده کن. تمدید رو خیلی قبل از انقضا انجام بده.

## روش اول: داکر کامپوز

داکر با افزونه‌ی Compose لازم داری و باید روی لینوکس باشه (LiveKit برای پورت‌های UDP صدا از شبکه‌ی host استفاده می‌کنه که داکر دسکتاپ روی مک و ویندوز پشتیبانی نمی‌کنه؛ برای تست اونجا از روش دوم یا یه ماشین مجازی لینوکس استفاده کن).

```bash
git clone https://github.com/TronIsHere/sedaamon.git
cd sedaamon

cp .env.example .env
cp deploy/livekit.example.yaml livekit.yaml
```

یه کلید و رمز برای LiveKit بساز و **همون جفت** رو توی هر دو فایل بذار:

```bash
openssl rand -hex 8    # → کلید API   (مثلاً APIa1b2c3d4e5f6a7b8)
openssl rand -hex 24   # → رمز API    (۴۸ کاراکتر)
```

فایل `.env` رو ویرایش کن:

```ini
SITE_URL=https://example.com
ADMIN_PHONES=09123456789               # شماره‌ی خودت: کسی که میتونه /admin رو باز کنه
SMS_PROVIDER=kavenegar
KAVENEGAR_API_KEY=...
KAVENEGAR_TEMPLATE=...                 # قالب verify/lookup با یه %token
LIVEKIT_API_KEY=APIa1b2c3d4e5f6a7b8
LIVEKIT_API_SECRET=<همون ۴۸ کاراکتر>
LIVEKIT_PUBLIC_URL=wss://rtc.example.com
```

توی `livekit.yaml` این‌ها رو درست کن: `node_ip` (آی‌پی عمومی سرور)، همون کلید و رمز زیر `keys:` و بلوک `turn:` (یا پاکش کن تا بدون TURN اجرا بشه). مقدار `webhook.urls` رو همون `http://127.0.0.1:3000/api/livekit/webhook` بذار.

همه‌چیز رو بالا بیار:

```bash
docker compose up -d --build
docker compose logs -f app       # صبر کن تا "sedaamon ready" ببینی
```

`SITE_URL` و بقیه‌ی تنظیمات صفحه‌های عمومی موقع ساخت ایمیج توی صفحه‌ها گذاشته میشن. اگه عوضشون کردی، دوباره `docker compose up -d --build` بزن.

کامپوز سه تا کانتینر میاره بالا: `app` (فقط روی `127.0.0.1:3000` گوش میده)، `mongo` (بدون هیچ پورت منتشرشده‌ای) و `livekit` (روی شبکه‌ی host). فایل‌های آپلودی و دیتابیس توی ولوم‌های `uploads` و `mongo` می‌مونن؛ [administration.md](administration.md#بکاپ) رو ببین.

> نصب با داکر تازه اضافه شده. اگه جایی کار نکرد، لطفاً یه issue باز کن.

بعدش برو سراغ [پراکسی](#پراکسی).

## روش دوم: Node و PM2

```bash
# اول Node 22، MongoDB 7، nginx (یا Caddy) و PM2 رو نصب کن
npm i -g pm2
```

فایل باینری لینوکسی `livekit-server` رو از [صفحه‌ی ریلیزهای LiveKit](https://github.com/livekit/livekit/releases) بگیر، بذارش توی `/usr/local/bin/` و قابل‌اجرا کن.

```bash
git clone https://github.com/TronIsHere/sedaamon.git
cd sedaamon
cp .env.example .env.production
cp deploy/livekit.example.yaml livekit.yaml
```

هر دو فایل رو مثل روش اول ویرایش کن (برای MongoDB محلی `MONGODB_URI` همون `mongodb://127.0.0.1:27017/sedaamon` میمونه؛ `HOST=127.0.0.1` بذار تا فقط پراکسی بتونه به برنامه برسه). بعد:

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs     # برنامه و LiveKit رو بالا میاره
pm2 save && pm2 startup
```

اگه npm یا مخزن‌های apt اونجا بسته‌ان، از آینه‌ی داخلی استفاده کن.

## پراکسی

دو تا سایت لازمه: خود برنامه (با ارتقای WebSocket برای Socket.io) و سیگنالینگ LiveKit.

- **Caddy** (ساده‌ترین): فایل [`deploy/Caddyfile.example`](../../deploy/Caddyfile.example) رو کپی کن و `example.com` رو عوض کن.
- **nginx**: فایل [`deploy/nginx.conf`](../../deploy/nginx.conf) رو بذار توی `/etc/nginx/sites-available/sedaamon`، `example.ir` رو با دامنه‌ات عوض کن، مسیر گواهی‌ها رو درست کن، فعالش کن و nginx رو reload کن.

فایل nginx روی `/api/auth/*` محدودیت درخواست هم داره (۱۰ درخواست در دقیقه برای هر آی‌پی). نگهش دار، چون خود برنامه جلوی تلاش‌های پشت‌سرهم ورود رو نمی‌گیره. [security.md](security.md) رو ببین.

## فایروال

| پورت | کاربرد |
|---|---|
| `80`، `443/tcp` | برنامه و سیگنالینگ LiveKit از طریق پراکسی |
| `7881/tcp` | WebRTC روی TCP (راه جایگزین) |
| `50000-60000/udp` | مدیای WebRTC |
| `443/udp`، `5349/tcp` | رله‌ی TURN، فقط اگه بلوک `turn:` رو فعال کردی (UDP روی ۴۴۳ از شبکه‌های موبایلی که پورت‌های دیگه رو می‌بندن رد میشه) |

**این‌ها نباید از اینترنت باز باشن:** `3000` (برنامه)، `7880` (API لایوکیت) و `27017` (MongoDB). فقط پراکسی روی همون ماشین باید بهشون برسه.

## اولین ورود

۱. برو به `https://example.com/signup` و شماره‌ات رو بزن.
۲. کد پیامکی رو وارد کن و یه اسم انتخاب کن.
۳. اگه شماره‌ات توی `ADMIN_PHONES` باشه، `https://example.com/admin` پنل مدیریت رو باز می‌کنه.

## چک کن که کار می‌کنه

- صفحه‌ی اصلی با HTTPS باز میشه و `https://example.com/api/me` جواب `401` میده (نه صفحه‌ی خطا).
- می‌تونی وارد بشی و یه سرور بسازی.
- از دو تا دستگاه وارد یه کانال صوتی شو و صدای هم رو بشنوید. اگه نشد، [troubleshooting.md](troubleshooting.md#صدا-وصل-نمیشه) رو ببین.
- توی لاگ سرور خطای `[config]` نیست. برنامه توی حالت production اگه کلیدهای توسعه‌ی LiveKit یا تنظیمات ناقص S3 ببینه اجرا نمیشه، و بقیه‌ی مشکلات رو هشدار میده.
