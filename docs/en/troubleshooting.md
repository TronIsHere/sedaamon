# Troubleshooting

## The app won't start: "Refusing to start"

Read the `[config]` lines above the error. Usual causes: the LiveKit key is still `devkey`, the secret is shorter than 32 characters, `MONGODB_URI` is missing, or `S3_ENDPOINT` is set without the bucket and keys. Fix `.env` and restart. Details: [configuration.md](configuration.md#startup-checks).

## I can't log in

- **No SMS arrives.** Check `SMS_PROVIDER=kavenegar`, the API key, and that the template exists and has exactly one `%token`. The server log shows the provider's error. With `SMS_PROVIDER=console` the code is only in the log.
- **"Code expired" / "too many attempts".** Codes last 2 minutes and allow 5 wrong tries. Ask for a new one (wait 60 seconds between requests).
- **Login works but you are logged out at once.** The cookie is `Secure` in production: you must use `https://`. Check that the proxy sends `X-Forwarded-Proto` and that you are not mixing `http` and `https` addresses.
- **429 on login.** Your proxy's rate limit ([`deploy/nginx.conf`](../../deploy/nginx.conf)) is working. Wait a minute.

## I can't open /admin

Your number must be in `ADMIN_PHONES` (any spelling works: `0912…`, `+98912…`), and the app restarted after you changed it. If the variable is empty the panel is off.

## Voice does not connect

1. **HTTPS?** The microphone is blocked on plain HTTP.
2. **`LIVEKIT_PUBLIC_URL`** must be `wss://rtc.example.com` (not `ws://`, not `localhost`). The proxy site for `rtc.` must forward WebSocket upgrades to port 7880.
3. **`node_ip`** in `livekit.yaml` must be the server's *public* IP.
4. **Firewall:** UDP 50000–60000 and TCP 7881 open. If people on mobile networks can't connect but Wi-Fi works, enable the `turn:` block, open 443/udp and 5349/tcp, and give TURN a certificate.
5. **Keys:** the key/secret in `.env` must equal those under `keys:` in `livekit.yaml`. A mismatch gives "invalid token" in LiveKit's log, and the participant list never updates (webhook signature check fails).
6. **LiveKit up?** `docker compose logs livekit` / `pm2 logs sedaamon-livekit`. From the app host: `curl http://127.0.0.1:7880` should answer `OK`.
7. **Docker on Mac/Windows:** LiveKit's host networking doesn't work in Docker Desktop. Test on a Linux machine.

## Voice connects but there is no sound (iPhone/Safari)

Safari only starts audio from a tap. Join from a tap on the channel; if a bar asks for one more tap, press it. In-app browsers (Telegram, Instagram) often lack WebRTC; open the link in Safari or Chrome.

## "Who is in the voice channel" is wrong or empty

The list comes from LiveKit webhooks. Check `webhook.urls` in `livekit.yaml` points to the app's address *as seen from LiveKit* (`http://127.0.0.1:3000/api/livekit/webhook` when LiveKit uses the host network), and that the keys match.

## Uploaded files show as missing

- Local disk: the folder must persist across restarts (Docker volume `uploads`) and be writable by the app user.
- S3: check endpoint, bucket, keys and `S3_FORCE_PATH_STYLE`. After switching storage backends, old files stay behind in the old store.
- Files larger than 5 MB are rejected. Behind nginx, `client_max_body_size` must be at least 10m (it is in the sample).

## Realtime features (messages, typing) don't update

The proxy must pass WebSocket upgrades (`Upgrade`/`Connection` headers) and have a long read timeout. The sample configs do. Check the browser console for failed `/socket.io/` requests.

## Development

- **Phone can't open the dev server:** add its address to `DEV_ALLOWED_ORIGINS` and use `http://<your-ip>:3000`. Phones can listen but browsers will not give the microphone over plain HTTP.
- **Database tests skipped:** set `TEST_MONGODB_URI` to a throwaway database.
- **Port already in use:** change `PORT`; update the `webhook.urls` in `livekit.dev.yaml` if you do (it points at port 3100).

Still stuck? Open an issue with: what you did, what you expected, the relevant log lines (remove secrets, phone numbers and codes), and your setup (Docker or PM2, OS, browser).
