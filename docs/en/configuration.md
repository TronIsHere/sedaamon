# Configuration

All settings are environment variables. In development put them in `.env.local`; on a server use `.env.production` (PM2) or `.env` (Docker Compose). Real environment variables win over these files. A fully commented template is [`.env.example`](../../.env.example).

Never commit these files. `.gitignore` already excludes everything starting with `.env` except `.env.example`.

## Application

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the app listens on. |
| `HOST` | `0.0.0.0` | Address to bind. Use `127.0.0.1` behind a proxy on the same machine. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/sedaamon` | MongoDB connection string. **Required in production.** |
| `SITE_URL` | `http://localhost:3000` | Public address, used in canonical links, the sitemap, share images and `llms.txt`. Set it to your real address. Read at build time (see below). |
| `SITE_CONTACT_EMAIL` | empty | Shown on the about and privacy pages and in structured data. Build time. |
| `ENAMAD_ID`, `ENAMAD_CODE` | empty | eNAMAD trust seal in the footer (Iranian domains). Both needed. Build time. |
| `APPLE_TEAM_ID` | empty | Enables Universal Links for the macOS app ([desktop/README.md](../../desktop/README.md)). |
| `DEV_ALLOWED_ORIGINS` | empty | Development only. Extra hosts allowed to load the dev server, e.g. a phone on your Wi-Fi (`192.168.1.20`). |

**Build-time settings.** `SITE_URL`, `SITE_CONTACT_EMAIL`, `ENAMAD_*` end up inside the built pages. After changing them, run `npm run build` again (or `docker compose up -d --build`).

## Admin panel

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PHONES` | empty | Comma-separated phone numbers (`09123456789,09121111111`) that can open `/admin`. **Empty means the admin panel is off.** |

Anyone who can receive an SMS on these numbers is an administrator, so list only numbers whose SIM you control.

## Login SMS

| Variable | Default | Description |
|---|---|---|
| `SMS_PROVIDER` | `console` | `console` or `kavenegar`. |
| `KAVENEGAR_API_KEY` | | Required for `kavenegar`. |
| `KAVENEGAR_TEMPLATE` | | Name of a Kavenegar verify/lookup template whose text contains a single `%token`. |

With `console` the code is printed to the server log. Outside production it is also returned to the login screen so you can test without SMS; **in production it is only logged**, so nobody can log in remotely. Use `kavenegar` for real users.

Codes are 5 digits, valid for 2 minutes, resendable after 60 seconds, with 5 wrong attempts allowed. Sessions last 30 days.

To use another SMS provider, add a branch in [`src/server/sms.ts`](../../src/server/sms.ts) (`sendOtp`).

## LiveKit (voice and video)

| Variable | Default | Description |
|---|---|---|
| `LIVEKIT_API_KEY` | `devkey` | Must equal a key in `livekit.yaml` → `keys:`. |
| `LIVEKIT_API_SECRET` | | Must equal that key's secret. At least 32 characters in production. |
| `LIVEKIT_URL` | `http://127.0.0.1:7880` | How **the server** reaches LiveKit's API. In Docker Compose this is set for you. |
| `LIVEKIT_PUBLIC_URL` | empty | How **browsers** reach LiveKit. In production this must be `wss://rtc.example.com`. In development leave it empty: the address of the page is used. |

The app **refuses to start in production** if the key is `devkey`, the secret contains `devsecret`, or the secret is shorter than 32 characters. Generate real ones with `openssl rand -hex 24`.

LiveKit's own configuration is in `livekit.yaml` (copy of [`deploy/livekit.example.yaml`](../../deploy/livekit.example.yaml)); that file contains the secret and is git-ignored.

## File storage

Uploads (pictures, files, voice messages) go to local disk unless `S3_ENDPOINT` is set.

| Variable | Default | Description |
|---|---|---|
| `UPLOAD_DIR` | `uploads` | Folder for local storage. In Docker it is `/data/uploads` (a volume). |
| `S3_ENDPOINT` | empty | Set to use an S3-compatible bucket (MinIO, Arvan, ParsPack, AWS…). |
| `S3_BUCKET` | | Bucket name. Required with `S3_ENDPOINT`. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | | Credentials. Required with `S3_ENDPOINT`. |
| `S3_REGION` | `us-east-1` | |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style URLs (`endpoint/bucket/key`), which most non-AWS providers need. |
| `MOVIE_MAX_MB` | `4096` | Largest film the cinema library accepts, in MB (at most 5120). Films arrive in `UPLOAD_DIR/.incoming` before they move to storage, so leave that much free disk even with S3. |
| `MOVIE_IMPORT_ALLOW_PRIVATE` | off | Set to `true` to let "download from link" fetch from private and local addresses (LAN, `localhost`). Off by default, so nobody can point the server at things only it can reach. |
| `FFMPEG_PATH`, `FFPROBE_PATH` | `ffmpeg`, `ffprobe` | Where these programs are, if not on the `PATH`. Only needed for the "prepare for Safari" button. |

The bucket can (and should) stay private: files are served through the app, which applies each channel's access rules. Limits: 5 MB per file, 10 files per message. A file uploaded but never attached to a message is removed after 24 hours.

Cinema rooms all play from one app-wide film library (MP4 or WebM; H.264 + AAC MP4 plays in every browser). Only the site admin (`ADMIN_PHONES`) manages it, from the **Films** tab of `/admin`: upload a file, or paste a direct link to an MP4/WebM file and the server downloads it in the background (up to three at a time; a restart drops downloads still running). The server reads a downloaded film's length from the file itself, so no ffmpeg is needed. Text subtitles inside a film (softsub: SRT, ASS/SSA, WebVTT, MP4 timed text) are read out of it the same way and shown in the player, Persian on by default; picture subtitles (PGS, VobSub) are not. A separate subtitle file (SRT, VTT, ASS/SSA; UTF-8, UTF-16 or windows-1256) can be added to any film from its subtitles button in the same tab. Safari and iPhones refuse MKV, and x265 unless it is an `hvc1` MP4; the **prepare for Safari** button on a film repackages it in the background with ffmpeg (`apt install ffmpeg`; the Docker image has it): the picture is copied untouched, sound becomes stereo AAC, and the new file replaces the original once checked. It needs free disk the size of the film (twice that with S3). Devices that can't decode x265 still can't. Everyone else browses the library and watches from inside any cinema room. A reverse proxy in front of the app must let these uploads through: [`deploy/nginx.conf`](../../deploy/nginx.conf) raises the body limit for `/api/movies` only; Caddy has no limit by default.

## Startup checks

In production the app checks its configuration before listening. It stops with a clear `[config]` message on: missing `MONGODB_URI`, development or short LiveKit keys, incomplete S3 settings. It warns about: `SMS_PROVIDER=console`, empty `ADMIN_PHONES`, unset `SITE_URL`, unset `LIVEKIT_PUBLIC_URL`.
