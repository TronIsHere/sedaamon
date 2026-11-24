# Security policy · سیاست امنیتی

## Supported versions

The project is in early development (`0.x`). Only the latest release on `main` gets security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting: the repository's **Security → Report a vulnerability** page. If that is not available, contact the maintainers by the address listed on the repository profile (maintainers: set a dedicated security contact here before publishing).

Please include what you found, steps to reproduce, the affected version or commit, and the impact you expect. We aim to acknowledge reports within a few days and to fix confirmed issues promptly, and we will credit you if you want.

Please do not access other people's data, degrade the service, or test against instances you do not own.

## Operators

If you run an instance, follow the [hardening checklist](docs/en/security.md#hardening-checklist-for-operators) ([فارسی](docs/fa/security.md)). The most important points: HTTPS, new LiveKit keys, a short `ADMIN_PHONES` list, rate-limiting `/api/auth/*` at the proxy, and never exposing MongoDB, port 3000 or port 7880.

## If a secret leaks

Rotate it first (S3 keys, Kavenegar key, LiveKit key and secret), then clean up. Removing a file or commit does not help if it was ever public.

---

## گزارش آسیب‌پذیری (فارسی)

**لطفاً مشکل امنیتی رو توی issue عمومی نگو.** از بخش **Security ← Report a vulnerability** همین مخزن در گیت‌هاب به‌صورت خصوصی گزارش بده و بنویس چی پیدا کردی، چطور بازتولیدش کنیم، روی کدوم نسخه، و چه تاثیری داره. تلاش می‌کنیم ظرف چند روز جواب بدیم.

اگه خودت سرور راه انداختی، [چک‌لیست امنیتی](docs/fa/security.md) رو بخون. اگه رمزی لو رفت، اول همون رو عوض کن (کلید S3، کلید کاوه‌نگار، کلید و رمز LiveKit)؛ پاک کردن فایل یا کامیت بعد از عمومی شدن چیزی رو درست نمی‌کنه.
