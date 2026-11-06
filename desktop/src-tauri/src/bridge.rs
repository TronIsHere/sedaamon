//! What the web app and the shell say to each other. The page calls the commands below through
//! `window.__TAURI__.core.invoke`; the shell answers with `sedaamon:desktop` DOM events.

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Hands `detail` to the page as a `sedaamon:desktop` event. When it carries a `url` and nothing on the
/// page takes the event (`preventDefault`), the window navigates there instead.
pub fn send(app: &AppHandle, detail: Value) {
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.eval(format!(
        "(function(d){{if(window.dispatchEvent(new CustomEvent('sedaamon:desktop',{{detail:d,cancelable:true}}))&&d.url)location.assign(d.url)}})({detail})"
    ));
}

/// Unread messages and pings, as the web app counts them (mutes and "mentions only" already applied).
#[tauri::command]
pub fn set_badge(app: AppHandle, count: u32) {
    crate::badge::set(&app, count);
}

/// A system notification. `tag` comes back in a `notification` event when it is clicked.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String, tag: String) -> Result<(), String> {
    let builder = app.notification().builder().title(title).body(body).extra("tag", tag);
    // macOS shows notifications silently unless asked for a sound; Windows plays its own.
    #[cfg(target_os = "macos")]
    let builder = builder.sound("default");
    builder.show().map_err(|e| e.to_string())
}

/// The voice call the tray menu controls.
#[derive(Deserialize)]
pub struct VoiceState {
    pub channel: String,
    pub server: String,
    pub muted: bool,
    pub deafened: bool,
}

/// Called with the call's state as it changes, and with `null` once it ends.
#[tauri::command]
pub fn set_voice(app: AppHandle, state: Option<VoiceState>) {
    crate::tray::set_voice(&app, state.as_ref());
}
