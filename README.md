# Sedaamon (صدامون)

Self-hosted voice, video and text channels in the style of Discord, built to run on a single server inside Iran. Nothing at runtime depends on a service outside the national network: fonts, icons, media relay, push and login are all served by your own machine.

## What it does

- Phone number login with an SMS code (Kavenegar, or printed to the log in development)
- Servers with invite links, text channels and voice channels
- Realtime chat (Socket.io), Jalali dates and a Persian right-to-left UI
- Voice channels you stay connected to while browsing text channels, with camera, screen share, mute and deafen
- Live "who's in the voice channel" list, driven by LiveKit webhooks
- Low-data mode that stops receiving video and keeps audio, for weak connections

## Architecture

```
browser ──https──▶ nginx ──▶ server.ts (Next.js 16 + Socket.io) ──▶ MongoDB
   │                 │                    ▲
   │                 └─wss─▶ LiveKit ─────┘ webhooks (who joined/left)
   └──── UDP 50000-60000 / TCP 7881 / TURN 443/udp, 5349 ──▶ LiveKit (media)
```

| Piece | Path |
|---|---|
| Custom server (Next + Socket.io, one process) | `server.ts` |
| Mongo models | `src/server/models.ts` |
| Auth (OTP, sessions) | `src/app/api/auth/*`, `src/server/session.ts`, `src/server/sms.ts` |
| LiveKit tokens, webhooks, presence | `src/server/livekit.ts`, `src/server/realtime.ts` |
| UI | `src/components/app/*` |

## Local development

Requirements: Node 22+, MongoDB running on `127.0.0.1:27017`, and `livekit-server` (`brew install livekit`).

```bash
cp .env.example .env.local
npm install
```

Run LiveKit and the app in two terminals:

```bash
npm run livekit
```

```bash
npm run dev
```

Open http://localhost:3000 (or the `PORT` you set). With `SMS_PROVIDER=console` the login code is shown on the login screen and printed in the server log.

The dev LiveKit config advertises your Mac's Wi-Fi IP (`en0`), so phones on the same network can join at `http://<that-ip>:3000`. Leave `LIVEKIT_PUBLIC_URL` empty in development: the token endpoint then points each browser at the host it opened the app on (a phone would get nothing from `localhost`). Over plain HTTP, phones can join and listen but browsers refuse the microphone, so test talking from phones against a deployed HTTPS server.

## Production (Ubuntu VPS in Iran, PM2 + nginx)

### 1. Install

Install Node 22, MongoDB 7, nginx and PM2 (`npm i -g pm2`). If npm or the package registries are blocked, use a domestic mirror for npm and apt.

Download the `livekit-server` linux binary from the LiveKit GitHub releases (on a machine that can reach GitHub if needed), copy it to `/usr/local/bin/livekit-server` and make it executable.

### 2. Configure

```bash
cp .env.example .env.production
cp deploy/livekit.example.yaml livekit.yaml
```

- In `.env.production`, set `SMS_PROVIDER=kavenegar` with its key and template, and set `LIVEKIT_PUBLIC_URL=wss://rtc.example.ir`. Use a new random key and secret (`openssl rand -hex 24`), matching in both files.
- In `livekit.yaml`, set `node_ip` to the server's public IP and fill in the TURN domain and certificate paths.

### 3. TLS certificates

Browsers only allow the mic and camera over HTTPS. Issue certificates for `example.ir`, `rtc.example.ir` and `turn.example.ir`, then set up renewal. Let's Encrypt can be unreachable during internet shutdowns, so renew well before expiry or use a domestic CA.

### 4. nginx and firewall

Copy `deploy/nginx.conf` to `/etc/nginx/sites-available/sedaamon`, edit the domains, enable it and reload nginx.

Open these ports:

| Port | Purpose |
|---|---|
| 80, 443/tcp | Web app and LiveKit signaling through nginx |
| 7881/tcp | WebRTC over TCP fallback |
| 50000–60000/udp | WebRTC media |
| 443/udp, 5349/tcp | TURN relay (UDP 443 gets through mobile networks that block other ports) |

Keep 3000 and 7880 closed. Only nginx should reach them.

### 5. Run

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

## Notes for running inside Iran

- **No foreign runtime dependencies.** Vazirmatn is served from `node_modules` instead of Google Fonts, and LiveKit runs with `use_external_ip: false`, so it never calls public STUN servers.
- **Distribution.** Users open the app from your own domain in the browser. A PWA manifest and an Android APK are not built yet.
- **Safari and iPhone.** Safari only starts sound from a tap, so joining a voice channel asks for the microphone and unlocks audio inside that tap. If the browser still holds the call's sound back (for example, after joining with the headphones muted), a bar under the header asks for one more tap. In-app browsers such as Telegram's may lack WebRTC; the app tells those users to open the link in Safari or Chrome. `LIVEKIT_PUBLIC_URL` must be `wss://` because HTTPS pages can't open `ws://` sockets.
- **Bandwidth.** Each listener receives every speaker's audio (about 30–50 kbps per stream). Video and screen share cost far more, so size the server's uplink for them, or ask users to turn on low-data mode.
