# Administration

## Admin panel

Open `/admin` while signed in with a phone number listed in `ADMIN_PHONES`. If the variable is empty the panel is disabled for everyone.

| Tab | You can |
|---|---|
| Overview | See users, new users this week, servers, public servers, channels, messages, people online and in voice |
| Users | Search by name or phone number, edit a name or bio, sign someone out everywhere, delete an account (not an admin's) |
| Servers | Search servers, rename, renew the invite link, remove from the public directory, delete |
| Channels | Browse a server's channels, rename or delete one |
| Messages | Browse and delete messages in a channel (moderation and abuse reports) |

Changes take effect immediately and people affected are disconnected from voice and updated live.

Admins can read messages in public and private channels through this panel. Say so in your privacy policy ([security.md](security.md#privacy-and-what-operators-can-see)).

## Roles inside a server

| Role | Can |
|---|---|
| Owner | Everything in the server; the only one who appoints admins and deletes the server |
| Admin | Manage channels and categories, delete messages, mute, kick and ban members below them |
| Custom roles | Created by the owner/admins to restrict private channels or mark members |
| Member | Read and write where allowed |

## Backups

What to back up:

| What | Where | How |
|---|---|---|
| Database | MongoDB | `mongodump` |
| Uploaded files | `uploads` volume / `UPLOAD_DIR`, or your S3 bucket | copy the folder, or use the bucket's own versioning/replication |
| Configuration | `.env` / `.env.production`, `livekit.yaml` | keep a copy somewhere safe: they hold secrets, so encrypt it |

Docker Compose:

```bash
# database
docker compose exec -T mongo mongodump --archive --gzip --db sedaamon > sedaamon-$(date +%F).archive.gz
# uploads
docker run --rm -v sedaamon_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

(The volume name is prefixed with your project folder name; check with `docker volume ls`.)

Restore:

```bash
docker compose exec -T mongo mongorestore --archive --gzip --drop < sedaamon-2026-01-01.archive.gz
```

Without Docker: `mongodump --db sedaamon --out backup/` and `mongorestore --drop backup/`.

Test a restore on a spare machine at least once.

## Upgrading

1. Back up (above).
2. Read the release notes for breaking changes.
3. Update and rebuild:

```bash
git pull
# Docker
docker compose up -d --build
# PM2
npm ci && npm run build && pm2 restart all
```

Database changes that old data needs are applied automatically at startup (for example role migration).

## Logs and health

- Docker: `docker compose logs -f app`. PM2: `pm2 logs sedaamon-web`.
- Look for lines starting with `[config]` (configuration), `[livekit]` and `[otp]`.
- The container reports health by requesting `/`; `docker compose ps` shows it.
- Never share logs publicly without checking them: with `SMS_PROVIDER=console` they contain login codes.

## Changing the SMS provider, storage or domain

- **SMS:** edit `SMS_PROVIDER` and the provider keys, restart.
- **Moving files between disk and S3:** the app does not migrate files. Copy existing objects into the new store under the same keys *before* switching, or old attachments will show as missing.
- **New domain:** update `SITE_URL`, `LIVEKIT_PUBLIC_URL`, the proxy and certificates, and rebuild (the public URL is built into pages). Sessions are cookie-based per domain, so everyone signs in again.
