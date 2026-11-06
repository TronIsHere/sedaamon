mod badge;
mod bridge;
mod tray;

use serde_json::json;
use tauri::ipc::CapabilityBuilder;
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

const PRODUCTION_URL: &str = "https://sedamon.ir";
const DEV_URL: &str = "http://localhost:3000";

/// The server the window shows. `SEDAAMON_URL` overrides it (e.g. a staging box or a phone-reachable dev IP).
fn server_url() -> Url {
    let default = if cfg!(debug_assertions) { DEV_URL } else { PRODUCTION_URL };
    let raw = std::env::var("SEDAAMON_URL").unwrap_or_else(|_| default.to_string());
    raw.parse().unwrap_or_else(|_| default.parse().unwrap())
}

/// The server the window shows, kept for building links to it.
struct Server(Url);

/// The page an opened link leads to. Only invites for now: `sedamon://invite/CODE`, or
/// `https://sedamon.ir/invite/CODE` when macOS hands the app a Universal Link.
fn link_path(url: &Url) -> Option<String> {
    let path = match url.scheme() {
        // `sedamon://invite/CODE` parses with `invite` as the host.
        "sedamon" => format!("/{}{}", url.host_str().unwrap_or_default(), url.path()),
        "https" | "http" => url.path().to_string(),
        _ => return None,
    };
    let code = path.strip_prefix("/invite/")?.trim_end_matches('/');
    let valid = !code.is_empty() && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    valid.then(|| format!("/invite/{code}"))
}

/// Brings the window back from the menu bar or tray.
pub(crate) fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Opens a page of the server in the window. The web app handles it in place when it can (so a voice call
/// keeps going); otherwise the window navigates there.
fn open_path(app: &AppHandle, path: &str) {
    let Ok(url) = app.state::<Server>().0.join(path) else { return };
    show_main(app);
    bridge::send(app, json!({ "type": "open", "path": path, "url": url }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Must come first: a second launch (e.g. from a sedamon:// link) passes its link here and quits.
    #[cfg(any(windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_main(app)));

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![bridge::set_badge, bridge::notify, bridge::set_voice])
        .setup(|app| {
            let server = server_url();
            let host = server.host_str().unwrap_or_default().to_string();
            app.manage(Server(server.clone()));

            // Only pages of our own server may talk to the shell.
            app.add_capability(
                CapabilityBuilder::new("server")
                    .remote(format!("{}/*", server.origin().ascii_serialization()))
                    .window("main")
                    .permission("allow-set-badge")
                    .permission("allow-notify")
                    .permission("allow-set-voice"),
            )?;

            // Windows registers sedamon:// at install time; registering again also covers dev and portable runs.
            #[cfg(any(windows, target_os = "linux"))]
            let _ = app.deep_link().register_all();

            // Launched by an invite link: go straight to it.
            let start = app
                .deep_link()
                .get_current()
                .ok()
                .flatten()
                .and_then(|urls| urls.iter().find_map(link_path))
                .and_then(|path| server.join(&path).ok())
                .unwrap_or_else(|| server.clone());

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(path) = event.urls().iter().find_map(link_path) {
                    open_path(&handle, &path);
                }
            });

            // A click on a notification opens the window at what it was about.
            let handle = app.handle().clone();
            app.notification().on_action(move |performed| {
                if performed.action_id() != "tap" {
                    return;
                }
                show_main(&handle);
                let tag = performed.notification().and_then(|n| n.extra().get("tag")).and_then(|t| t.as_str());
                if let Some(tag) = tag {
                    bridge::send(&handle, json!({ "type": "notification", "tag": tag }));
                }
            })?;

            tray::create(app.handle())?;

            // The bundled page tries the server first and shows a retry screen when it is unreachable.
            let loader = format!("index.html?to={}", start);
            let nav_handle = app.handle().clone();

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(loader.into()))
                .title("صدامون")
                .inner_size(1280.0, 840.0)
                .min_inner_size(420.0, 560.0)
                .center()
                // Hidden in the menu bar, the page still has to hear new messages and carry a voice call.
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                .on_navigation(move |url| {
                    // Stay inside the app for our own server and the bundled page; send everything else to the browser.
                    let ours = url.scheme() == "tauri"
                        || url.host_str() == Some("tauri.localhost")
                        || url.host_str() == Some(host.as_str())
                        || url.scheme() == "about"
                        || url.scheme() == "blob";
                    if !ours {
                        let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    ours
                })
                .on_page_load(|window, payload| {
                    // A new page starts with nothing unread and no call until it says otherwise (a reload ends a call).
                    if payload.event() == PageLoadEvent::Started {
                        badge::set(window.app_handle(), 0);
                        tray::set_voice(window.app_handle(), None);
                    }
                });
            // WebView2 ignores the throttling policy above; these flags keep a hidden window's timers and media running.
            #[cfg(windows)]
            let window = window.additional_browser_args(
                "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                 --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding",
            );
            window.build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window only hides it: the app stays online, in any voice call, in the menu bar or tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Sedaamon")
        .run(|app, event| {
            // Clicking the Dock icon brings the hidden window back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main(app);
            }
            let _ = (app, event);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(url: &str) -> Option<String> {
        link_path(&url.parse().unwrap())
    }

    #[test]
    fn reads_invite_links() {
        assert_eq!(path("sedamon://invite/AbC-12_x").as_deref(), Some("/invite/AbC-12_x"));
        assert_eq!(path("sedamon://invite/abc/").as_deref(), Some("/invite/abc"));
        assert_eq!(path("https://sedamon.ir/invite/abc").as_deref(), Some("/invite/abc"));
        assert_eq!(path("sedamon://invite/"), None);
        assert_eq!(path("sedamon://invite/a/b"), None);
        assert_eq!(path("sedamon://settings/abc"), None);
        assert_eq!(path("https://sedamon.ir/invite/a%22b"), None);
        assert_eq!(path("file:///invite/abc"), None);
    }
}
