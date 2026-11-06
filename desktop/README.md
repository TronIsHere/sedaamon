# Sedaamon for macOS and Windows

A thin [Tauri 2](https://v2.tauri.app) shell around the web app: the window loads the server, so every web release reaches the desktop app without a new build. A small bundled page (`dist/index.html`) checks the server first and shows a retry screen when it is unreachable. Links to other sites open in the default browser.

| Build | Loads |
|---|---|
| `npm run dev` (debug) | `http://localhost:3000` (start the web app first with `npm run dev` in the repo root) |
| `npm run build` (release) | `https://sedamon.ir` |

Set `SEDAAMON_URL` to point either build somewhere else, e.g. `SEDAAMON_URL=http://192.168.1.20:3000`.

## What the shell adds

- **Runs in the background.** Closing the window hides it; the app stays online and in any voice call, behind an icon in the menu bar (macOS) or the notification area (Windows). The icon's menu has Mute, Deafen, Leave voice and Quit. Clicking the Dock icon, the tray icon (Windows) or a notification brings the window back. Quit from the menu (or ⌘Q) to really exit.
- **Unread badge.** The web app sends the same unread count it puts in the tab title (mutes and "mentions only" already applied) to the Dock icon, or as a red overlay on the taskbar button on Windows.
- **Native notifications** in Notification Center / the Windows action center, following the same mute and "mentions only" rules; clicking one opens that channel. The WebView's own notifications are not used. People can still turn them off in the app's notification settings.
- **Invite links open in the app.** `sedamon://invite/CODE` opens the app on joining that server, without dropping a voice call. The web invite page offers this link on computers. On macOS, plain `https://sedamon.ir/invite/...` links can open the app too, through Universal Links (below).

The web app finds the shell through `window.__TAURI__` (`src/lib/desktop.ts`); only pages of the configured server may call it.

## Setup

```bash
brew install rustup && rustup default stable
export PATH=/opt/homebrew/opt/rustup/bin:$PATH   # rustup is keg-only
cd desktop && npm install
```

On Windows, install [Rust](https://rustup.rs) and the Visual Studio C++ build tools, then `cd desktop && npm install`. WebView2 ships with Windows 10/11; the installer fetches it when missing.

## Run and build

```bash
npm run dev                      # debug window
npm run build -- --bundles app   # macOS: src-tauri/target/release/bundle/macos/Sedaamon.app
npm run build -- --bundles dmg   # macOS: installer image
npm run build -- --bundles nsis  # Windows: src-tauri/target/release/bundle/nsis/Sedaamon_x.y.z_x64-setup.exe
```

Each platform builds its own installers; build the Windows one on Windows (or in CI on `windows-latest`).

The icon comes from `design/brand/bolbol-icon.svg`; regenerate with `npx tauri icon ../design/brand/bolbol-icon.svg` (then delete the `android/` and `ios/` folders it creates in `src-tauri/icons`). The menu bar icon, `icons/tray-template.png`, is `design/brand/bolbol-mark-ink.svg` at 44×44: macOS recolors it to match the menu bar.

## Deep links

- macOS registers `sedamon://` when the bundled app is first opened (from `plugins.deep-link` in `tauri.conf.json`); `npm run dev` does not, so test links with a built `.app`.
- Windows registers it on install, and the app registers it again on every start (per user, so it also works from `npm run dev`). Opening a link while the app runs hands it to the running app.
- Try one with `open sedamon://invite/CODE` (macOS) or `start sedamon://invite/CODE` (Windows).

### Universal Links (macOS)

Needs a signed app, so it is off in everyday builds:

1. In the Apple Developer portal, give the App ID `ir.arzhaam.seda` the Associated Domains capability, and make a Developer ID provisioning profile for it. Save it as `src-tauri/Sedaamon.provisionprofile` (git-ignored).
2. Replace `TEAMID` in `src-tauri/Entitlements.signed.plist` with your team id.
3. Set `APPLE_TEAM_ID` on the web server; it then serves `/.well-known/apple-app-site-association`, which claims `/invite/*` for the app.
4. Build with `npm run build -- --config src-tauri/tauri.signed.conf.json` (plus `bundle.macOS.signingIdentity` and the notarization env vars).

macOS fetches the association file when the app is installed, so a change to it can take a while to reach people.

## Notes

- The app is unsigned. To hand it to other people, sign and notarize it with an Apple Developer ID (`bundle.macOS.signingIdentity` plus notarization env vars); `Entitlements.plist` already grants microphone, camera and network access for the hardened runtime. Unsigned Windows installers trigger SmartScreen; sign them with a code-signing certificate (`bundle.windows.certificateThumbprint`).
- Microphone and camera prompts use the Persian texts in `src-tauri/Info.plist`.
- In debug builds, macOS shows notifications as coming from Terminal; the bundled app shows them under its own name.
- Background throttling is off, so a hidden window keeps its connection: on macOS 14+ through WebKit's scheduling policy, on Windows through WebView2 flags.
- Screen share depends on the system WebView (WKWebView); check it before promising it in the desktop app.
