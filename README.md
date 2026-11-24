# Sedaamon (صدامون)

**English** · [فارسی](README.fa.md)

Self-hosted voice, video and text chat in the style of Discord, with a Persian right-to-left interface. You run it on your own server. Nothing at runtime depends on a service outside your network: fonts, icons, media relay and login are all served by your own machine, so it keeps working when international internet access is cut.

> Status: early (`0.x`). It runs in production for its authors, but expect rough edges and breaking changes between releases.

## Features

- Sign in with a phone number and an SMS code (Kavenegar, or printed to the log in development)
- Servers with invite links, text channels, voice channels, categories and a public server directory
- Realtime chat (Socket.io): replies, edit, delete, reactions, pins, mentions, forwarding, typing indicators, stickers
- Pictures, files and voice messages (hold to record); stored on disk or in any S3-compatible bucket
- Voice and video channels with camera, screen share, mute and deafen, powered by [LiveKit](https://livekit.io); a low-data mode that drops video and keeps audio
- Watch together, events, welcome screens with rules, friends and direct messages
- Roles and permissions: owner, admin, custom roles, private channels, mute, kick, ban
- Unread counts and a "new messages" line that agree across devices; per-server, per-channel and per-conversation notification settings
- Admin panel for the instance operator (users, servers, channels, messages, stats)
- Jalali (Persian) calendar, Persian UI, installable as a PWA; optional desktop app for macOS and Windows ([desktop/](desktop/README.md))

## Quick start (Docker, Linux server)

You need a Linux server with Docker, a domain name, and HTTPS (browsers only allow the microphone and camera over HTTPS).

```bash
git clone https://github.com/TronIsHere/sedaamon.git && cd sedaamon
cp .env.example .env                           # edit it: SITE_URL, ADMIN_PHONES, LIVEKIT_*, SMS_*
cp deploy/livekit.example.yaml livekit.yaml    # edit it: node_ip, keys, TURN domain
docker compose up -d --build
```

Then put a reverse proxy with HTTPS in front ([Caddy](deploy/Caddyfile.example) or [nginx](deploy/nginx.conf)) and open the firewall for LiveKit's ports. The full walkthrough, including the non-Docker route with PM2, is in **[docs/en/installation.md](docs/en/installation.md)**.

## Try it locally

Requirements: Node 22+, MongoDB on `127.0.0.1:27017`, and `livekit-server` (`brew install livekit`).

```bash
cp .env.example .env.local
npm install
npm run livekit     # terminal 1
npm run dev         # terminal 2
```

Open <http://localhost:3000>. With `SMS_PROVIDER=console` the login code is shown on the login screen and printed in the server log. To make yourself an admin, put your phone number in `ADMIN_PHONES`.

## Documentation

| | English | فارسی |
|---|---|---|
| Installation and deployment | [installation.md](docs/en/installation.md) | [installation.md](docs/fa/installation.md) |
| Configuration reference | [configuration.md](docs/en/configuration.md) | [configuration.md](docs/fa/configuration.md) |
| Architecture | [architecture.md](docs/en/architecture.md) | [architecture.md](docs/fa/architecture.md) |
| Running it: admin panel, backups, upgrades | [administration.md](docs/en/administration.md) | [administration.md](docs/fa/administration.md) |
| Security and privacy | [security.md](docs/en/security.md) | [security.md](docs/fa/security.md) |
| Troubleshooting | [troubleshooting.md](docs/en/troubleshooting.md) | [troubleshooting.md](docs/fa/troubleshooting.md) |

Also: [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [desktop app](desktop/README.md)

## Project layout

| Path | What is there |
|---|---|
| `server.ts` | The one process: Next.js + Socket.io |
| `src/app/` | Pages and API routes (`src/app/api/*`) |
| `src/components/` | UI (`app/` is the chat app, `admin/`, `landing/`, `onboarding/`) |
| `src/server/` | Server logic: models, permissions, LiveKit, SMS, storage, realtime |
| `src/lib/` | Code shared by browser and server: types, Jalali dates, search, notification rules |
| `deploy/` | nginx, Caddy and LiveKit examples |
| `desktop/` | Tauri shell for macOS and Windows |
| `design/` | Logo and brand sources |

## Tests

```bash
npm test            # unit tests
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/sedaamon_test npm test   # also the database tests
npm run typecheck && npm run lint
```

The database tests create and drop their own databases next to the one you name, so point them at a throwaway MongoDB.

## License

No license file has been added yet. The owner must choose one before the code can legally be reused; see [CONTRIBUTING.md](CONTRIBUTING.md#license).
