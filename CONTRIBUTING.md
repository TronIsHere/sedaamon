# Contributing

Thanks for helping with Sedaamon. Bug reports, fixes, translations and documentation are all welcome. فارسی در پایین همین صفحه است.

## Ground rules

- Be kind and assume good intent. Discuss ideas, not people.
- **Never include secrets, real phone numbers, logs with login codes, or user data** in issues, pull requests or screenshots.
- For security problems use [SECURITY.md](SECURITY.md), not a public issue.

## Setup

```bash
cp .env.example .env.local
npm install
npm run livekit      # needs livekit-server
npm run dev
```

Requirements: Node 22+, MongoDB, `livekit-server`. See the [README](README.md).

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npm test
```

Database tests need `TEST_MONGODB_URI` pointing at a throwaway MongoDB. Add or update tests for logic you change (`src/lib/*.test.ts`, `src/server/*.test.ts`).

## Code style

- TypeScript, strict. Match the surrounding code: naming, comment density, idioms.
- Keep API routes thin; put rules in `src/server/*`, and shared pure logic in `src/lib/*` where it can be tested.
- Every server route must authenticate (`requireUser`) and check access to the specific server/channel. Private channels must not leak through lists, realtime events, search or typing.
- UI is Persian and right-to-left first. Use logical CSS properties, Persian digits for display, and keep user-facing text in Persian unless you are adding a translation mechanism.
- This project uses a recent Next.js with API differences from older versions: read `node_modules/next/dist/docs/` before changing framework-level code.
- Don't add outside runtime dependencies (CDNs, fonts, analytics). The app must work on a network with no access to the outside world.

## Commits and pull requests

- Small, focused changes with a clear description of *why*.
- Mention related issues. Screenshots help for UI changes (RTL and mobile width).
- Docs live in `docs/en` and `docs/fa`; if you change behaviour, update both or say that the Persian page needs an update.

## License

The project has no license file yet; the maintainer will add one. By contributing you agree your contribution is released under the license the project adopts.

---

# مشارکت در پروژه (فارسی)

ممنون که می‌خوای به صدامون کمک کنی. گزارش باگ، رفع مشکل، ترجمه و بهتر کردن مستندات، همه خوش‌آمدن.

- **هیچ‌وقت رمز، کلید، شماره‌ی واقعی، لاگ حاوی کد ورود یا اطلاعات کاربرها رو توی issue یا pull request نذار.**
- مشکل امنیتی رو توی issue عمومی نگو؛ طبق [SECURITY.md](SECURITY.md) خصوصی گزارش بده.
- قبل از ارسال pull request این سه تا رو اجرا کن: `npm run typecheck`، `npm run lint`، `npm test`.
- رابط کاربری فارسی و راست‌چینه. متن‌های کاربر فارسی بمونه و به منبع بیرونی (فونت، CDN، آمارگیر) وابسته نشی؛ برنامه باید روی شبکه‌ی داخلی هم کار کنه.
- هر مسیر API باید اول کاربر رو بشناسه و بعد دسترسی به همون سرور و کانال رو چک کنه. کانال خصوصی نباید از هیچ راهی (لیست، رویداد زنده، جستجو، «در حال تایپ») لو بره.
- مستندات توی `docs/en` و `docs/fa` هستن. اگه رفتار برنامه عوض شد، هر دو رو به‌روز کن یا بنویس که نسخه‌ی فارسی (یا انگلیسی) نیاز به به‌روزرسانی داره.
