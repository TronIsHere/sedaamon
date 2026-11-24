# Installation

Two ways to run Sedaamon on a server: **Docker Compose** (recommended) or **directly with Node and PM2**. Both need the same three outside pieces: a domain with HTTPS, an SMS provider for login codes, and open firewall ports for voice.

Contents: [What you need](#what-you-need) · [DNS and HTTPS](#dns-and-https) · [Option A: Docker](#option-a-docker-compose) · [Option B: Node + PM2](#option-b-node--pm2) · [Reverse proxy](#reverse-proxy) · [Firewall](#firewall) · [First login](#first-login) · [Check it works](#check-it-works)

## What you need

| Thing | Notes |
|---|---|
| A Linux server | Ubuntu 22.04+ is what the docs assume. 2 vCPU / 2 GB RAM is enough for small groups. Voice and video need uplink: each listener receives every speaker's audio (30–50 kbps per stream); video and screen share cost far more. |
| A public IP | LiveKit advertises it to browsers (`node_ip`). |
| A domain | Two names pointing at the server: the app (`example.com`) and LiveKit signalling (`rtc.example.com`). Optionally a third for TURN (`turn.example.com`). |
| HTTPS certificates | Browsers refuse the microphone and camera on plain HTTP. |
| MongoDB 7 | Included in the Docker setup. |
| An SMS provider | [Kavenegar](https://kavenegar.com) is built in. Without one, login codes only appear in the server log. |
| Node 22+ | Only for Option B. |

## DNS and HTTPS

Create `A` records for `example.com` and `rtc.example.com` (and `turn.example.com` if you use TURN) pointing at the server.

Get certificates with whatever you like. If your server can reach Let's Encrypt, [Caddy](../../deploy/Caddyfile.example) does it automatically. If not (for example inside a restricted network), use a local CA and the [nginx config](../../deploy/nginx.conf). Renew well before expiry.

## Option A: Docker Compose

Needs Docker with the Compose plugin, on Linux (LiveKit uses host networking for its UDP media ports, which Docker Desktop on macOS/Windows does not support; use Option B or a Linux VM for local testing there).

```bash
git clone https://github.com/TronIsHere/sedaamon.git
cd sedaamon

cp .env.example .env
cp deploy/livekit.example.yaml livekit.yaml
```

Generate a LiveKit key and secret, and put the **same pair** in both files:

```bash
openssl rand -hex 8    # → API key     (e.g. APIa1b2c3d4e5f6a7b8)
openssl rand -hex 24   # → API secret  (48 characters)
```

Edit `.env`:

```ini
SITE_URL=https://example.com
ADMIN_PHONES=09123456789               # your number: who can open /admin
SMS_PROVIDER=kavenegar
KAVENEGAR_API_KEY=...
KAVENEGAR_TEMPLATE=...                 # a verify/lookup template with a single %token
LIVEKIT_API_KEY=APIa1b2c3d4e5f6a7b8
LIVEKIT_API_SECRET=<the 48 characters>
LIVEKIT_PUBLIC_URL=wss://rtc.example.com
```

Edit `livekit.yaml`: `node_ip` (the server's public IP), the same key and secret under `keys:`, and the `turn:` block (or delete it to run without TURN). Leave `webhook.urls` as `http://127.0.0.1:3000/api/livekit/webhook`.

Start everything:

```bash
docker compose up -d --build
docker compose logs -f app       # wait for "sedaamon ready"
```

`SITE_URL` and the other public-page settings are baked in when the image is built. If you change them, run `docker compose up -d --build` again.

Compose runs three containers: `app` (listening on `127.0.0.1:3000` only), `mongo` (no published ports) and `livekit` (host network). Uploaded files and the database live in the named volumes `uploads` and `mongo`; see [administration.md](administration.md#backups).

> The Docker setup is new. If something in it does not work for you, please open an issue.

Continue with [Reverse proxy](#reverse-proxy).

## Option B: Node + PM2

```bash
# Node 22, MongoDB 7, nginx (or Caddy) and PM2 installed first
npm i -g pm2
```

Install the `livekit-server` Linux binary from the [LiveKit releases](https://github.com/livekit/livekit/releases) into `/usr/local/bin/` and make it executable.

```bash
git clone https://github.com/TronIsHere/sedaamon.git
cd sedaamon
cp .env.example .env.production
cp deploy/livekit.example.yaml livekit.yaml
```

Edit both files as in Option A (`MONGODB_URI` stays `mongodb://127.0.0.1:27017/sedaamon` for a local MongoDB; set `HOST=127.0.0.1` so only the proxy can reach the app). Then:

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs     # starts the app and LiveKit
pm2 save && pm2 startup
```

If npm or apt registries are blocked where you are, use a domestic mirror.

## Reverse proxy

Two sites are needed: the app (with WebSocket upgrade, for Socket.io) and LiveKit signalling.

- **Caddy** (simplest): copy [`deploy/Caddyfile.example`](../../deploy/Caddyfile.example), replace `example.com`.
- **nginx**: copy [`deploy/nginx.conf`](../../deploy/nginx.conf) to `/etc/nginx/sites-available/sedaamon`, replace `example.ir` with your domain, point the certificate paths at your certificates, enable it and reload.

The nginx file also rate-limits `/api/auth/*` (10 requests a minute per IP). Keep that: the app itself does not limit login attempts. See [security.md](security.md).

## Firewall

| Port | Purpose |
|---|---|
| 80, 443/tcp | Web app and LiveKit signalling through the proxy |
| 7881/tcp | WebRTC over TCP (fallback) |
| 50000–60000/udp | WebRTC media |
| 443/udp, 5349/tcp | TURN relay, only if you enabled `turn:` (UDP 443 gets through mobile networks that block other ports) |

**Keep closed to the internet:** 3000 (the app), 7880 (LiveKit API) and 27017 (MongoDB). Only the proxy on the same machine should reach them.

## First login

1. Open `https://example.com/signup` and enter your phone number.
2. Enter the SMS code. Pick a name.
3. If your number is in `ADMIN_PHONES`, `https://example.com/admin` opens the admin panel.

## Check it works

- The home page loads over HTTPS and `https://example.com/api/me` returns `401` (not an error page).
- You can log in and create a server.
- Join a voice channel from two devices and hear each other. If you can't, see [troubleshooting.md](troubleshooting.md#voice-does-not-connect).
- Server log shows no `[config]` errors. At startup the app refuses to run in production with development LiveKit keys or an incomplete S3 setup, and warns about the rest.
