# Architecture

## Overview

```
browser ──https──▶ reverse proxy ──▶ server.ts (Next.js 16 + Socket.io) ──▶ MongoDB
   │                    │                       ▲                      └──▶ uploads: disk or S3
   │                    └─wss─▶ LiveKit ────────┘ webhooks (who joined / left)
   └── UDP 50000-60000 / TCP 7881 / TURN 443/udp, 5349 ──▶ LiveKit (media)
```

There is one Node process (`server.ts`) that serves the pages and API routes through Next.js and the realtime channel through Socket.io. Voice and video never touch it: browsers get a short-lived token from the app and then talk to LiveKit directly.

## Components

| Piece | Where | What it does |
|---|---|---|
| Custom server | `server.ts` | Starts Next.js and Socket.io on one HTTP server; authenticates sockets with the session cookie; relays typing indicators; runs the event scheduler and upload sweeper; checks the production configuration. |
| API routes | `src/app/api/**/route.ts` | REST-style JSON endpoints. Each is thin and calls `src/server/*`. |
| Server logic | `src/server/*` | Business rules: `permissions`/`access` (who can see and do what), `messages`, `channels`, `servers`, `roles`, `bans`, `friends`, `dms`, `events`, `files`, `notifications`, `reads` (unread markers). |
| Data models | `src/server/models.ts` | Mongoose schemas. |
| Realtime | `src/server/realtime.ts`, `presence.ts` | Socket rooms (`user:<id>`, `server:<id>`), online presence, in-memory voice participant map. |
| Auth | `src/app/api/auth/*`, `session.ts`, `sms.ts` | Phone + one-time code → session cookie. |
| Voice | `src/server/livekit.ts`, `src/app/api/livekit/*` | Issues LiveKit tokens for channels the user may join; receives webhooks to show who is in a voice channel. |
| Storage | `src/server/storage.ts` | One interface, two backends: local disk or S3-compatible. |
| UI | `src/components/*` | React 19 client app (`app/`), admin panel, landing and info pages, onboarding. |
| Shared code | `src/lib/*` | Types, Jalali calendar, phone normalisation, search, mentions, notification rules; used by both browser and server and unit-tested. |
| Desktop shell | `desktop/` | Tauri app that wraps the web app (tray, badge, native notifications, deep links). |

## Data

MongoDB holds everything except uploaded files: users, sessions, one-time codes, servers, members, roles, categories, channels, messages, conversations (DMs), friendships, notifications, events, and the metadata of uploads. Profile pictures and server icons are stored as documents in MongoDB (not in the upload store).

Expiring data (sessions, one-time codes, notifications after two weeks, events a week after they start) uses MongoDB TTL indexes, so it cleans itself.

## Request flow

1. **Login:** `POST /api/auth/otp` stores a hashed code and sends the SMS; `POST /api/auth/verify` checks it, creates a user if needed and sets the `sid` cookie (httpOnly, `Secure` in production). Only a SHA-256 hash of the session token is stored.
2. **Reading and writing:** API routes read the cookie, load the user, check permissions for the target server/channel, then act.
3. **Realtime:** after a write, the server emits Socket.io events to the people allowed to see it (server room, or the channel's audience for private channels, or the two DM participants).
4. **Joining voice:** the client asks `POST /api/livekit/token` for a channel. The server checks access and returns a 6-hour LiveKit token for room `ch_<channelId>`. LiveKit calls `POST /api/livekit/webhook` (signature-checked) on join/leave, and the server broadcasts the participant list.
5. **Files:** uploaded through the API (type sniffed from bytes, not the header), stored under a generated key, and downloaded through the API, which checks channel access each time.

## State that lives in memory

Online presence and the voice participant map are kept in the Node process. A restart clears presence (sockets reconnect) and the voice map is rebuilt from LiveKit at startup. Because of this, **run a single app instance**; scaling to several instances would need a shared adapter for Socket.io and presence, which is not built.

## Tech stack

Next.js 16 (App Router, custom server), React 19, TypeScript, Tailwind CSS 4, Socket.io, Mongoose 9 / MongoDB, LiveKit (server SDK and client), AWS S3 SDK, sharp (image processing), Zod, Vitest, Tauri 2 (desktop).

> This project uses a recent Next.js version whose APIs differ from older ones. Read the guides in `node_modules/next/dist/docs/` before changing framework-level code.

## Offline-friendly by design

Fonts (Vazirmatn) are served from `node_modules`, icons are bundled, and LiveKit is configured with `use_external_ip: false` so it never asks public STUN servers. The browser needs nothing from third-party hosts, which is what lets the app work on a national intranet.
