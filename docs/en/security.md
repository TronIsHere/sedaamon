# Security and privacy

To report a vulnerability, see [SECURITY.md](../../SECURITY.md).

## Hardening checklist for operators

Do these before inviting real users.

- [ ] **HTTPS everywhere.** The app sets the session cookie `Secure` in production, so login does not work over plain HTTP, and browsers block the microphone without HTTPS anyway.
- [ ] **New LiveKit key and secret** (`openssl rand -hex 24`), the same in `.env` and `livekit.yaml`. The app refuses to start with the development pair.
- [ ] **`ADMIN_PHONES` lists only numbers you control.** An attacker who takes over such a SIM becomes an admin. Keep the list short.
- [ ] **Rate-limit `/api/auth/*`** at the proxy. The provided nginx config does it; for Caddy see the commented block in the example. The app itself has *no* rate limiting; without it, someone can flood a number with SMS (costing you money) and guess 5-digit codes (5 tries per code, a new code every minute).
- [ ] **Do not expose** ports 3000 (app), 7880 (LiveKit API) or 27017 (MongoDB) to the internet. Bind the app to `127.0.0.1` (done in Docker Compose) and keep MongoDB on a private network or localhost.
- [ ] **MongoDB:** if it is reachable by anything besides the app, turn on authentication and put the credentials in `MONGODB_URI`.
- [ ] **Never commit secrets.** `.env*` and `livekit.yaml` are git-ignored. If a secret was ever committed or pasted publicly, treat it as leaked: rotate it, don't just delete the file.
- [ ] **Private S3 bucket.** The app serves files itself and checks permissions; a public bucket would bypass them.
- [ ] **Backups** are encrypted and stored away from the server ([administration.md](administration.md#backups)).
- [ ] **Keep updated:** `npm audit`, the OS, Docker images, and this project's releases.
- [ ] **Run `SMS_PROVIDER=kavenegar`** (or your own) in production. `console` only logs the code.

## What the application does for you

- Login codes and session tokens are stored as SHA-256 hashes; sessions are `httpOnly`, `SameSite=Lax`, 30 days.
- Wrong code attempts are limited per code (5); resend is limited to once a minute per number.
- Every API route checks the session, then the user's standing in the server and channel. Private channels are hidden from non-members in lists, history, realtime events and typing indicators.
- Uploads: the picture/audio type is decided by the file's bytes, not the client's header; names are cleaned; storage keys are generated server-side and path traversal is rejected; size is capped at 5 MB.
- LiveKit webhooks are verified with the shared secret.
- Public pages escape structured data to prevent script injection.
- Users removed from a channel, banned, or whose server is deleted are disconnected from the voice room.

## Known limitations

Be honest with your users about these.

- **No end-to-end encryption.** Messages are stored in plain text in MongoDB. Anyone with database access, and instance admins through the admin panel, can read them. Voice and video are encrypted in transit (DTLS-SRTP) but pass through your LiveKit server.
- **Application-level rate limiting is missing** (see checklist). Plan for it at the proxy or firewall.
- **Phone numbers are the identity.** They are stored in clear text (needed to log in). They are not shown to other members, but admins see them.
- **Single instance only**, and state such as presence is in memory ([architecture.md](architecture.md#state-that-lives-in-memory)).
- **Short 5-digit codes** are acceptable only together with rate limiting.

## Privacy and what operators can see

If you run a public instance, publish a policy that matches what you actually do. The built-in `/privacy` and `/terms` pages are written for the original deployment (Persian, servers inside Iran). **Review and edit them** (`src/app/privacy/page.tsx`, `src/app/terms/page.tsx`) before launching your own instance. They state, for example, where data is stored and whether admins read messages.

Data the app stores about a person: phone number, name, colour, bio, status, avatar, messages and files they sent, memberships, friends, last-seen time. Calls and screen shares are not recorded by the app (LiveKit recording is not configured).

To delete a person's data, remove the user in the admin panel; check afterwards that your backups age out according to your policy.

## Open-sourcing your fork? Check before you push

```bash
git grep -nIE "api[_-]?key|secret|password|token" -- . ':!package-lock.json' | less
git log -p --all -S"<a value you used as a secret>" | head
```

Searching history matters: deleting a file does not remove it from past commits. If a real secret is in history, rotate it and rewrite the history (for example with `git filter-repo`) before publishing.
