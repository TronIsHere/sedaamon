//! The menu bar (macOS) or notification area (Windows) icon that keeps the app reachable while its window is closed.

use serde_json::json;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::badge::persian_digits;
use crate::bridge::{self, VoiceState};

const NOT_IN_VOICE: &str = "در کانال صوتی نیستید";

/// The menu items that follow the voice call, and the icon whose tooltip shows unread messages.
struct Tray {
    icon: TrayIcon<Wry>,
    status: MenuItem<Wry>,
    mute: CheckMenuItem<Wry>,
    deafen: CheckMenuItem<Wry>,
    leave: MenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "باز کردن صدامون", true, None::<&str>)?;
    let status = MenuItem::with_id(app, "status", NOT_IN_VOICE, false, None::<&str>)?;
    // Same words as the buttons in the app.
    let mute = CheckMenuItem::with_id(app, "mute", "بستن میکروفون", false, false, None::<&str>)?;
    let deafen = CheckMenuItem::with_id(app, "deafen", "قطع صدای دیگران", false, false, None::<&str>)?;
    let leave = MenuItem::with_id(app, "leave", "قطع اتصال", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "خروج از صدامون", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app)?,
            &status,
            &mute,
            &deafen,
            &leave,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let builder = TrayIconBuilder::with_id("main")
        .tooltip("صدامون")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::show_main(app),
            // The page owns the call; it toggles and reports the new state back through `set_voice`.
            action @ ("mute" | "deafen" | "leave") => bridge::send(app, json!({ "type": "voice", "action": action })),
            "quit" => app.exit(0),
            _ => {}
        });

    // macOS: a monochrome template icon that follows the menu bar's colors; a click opens the menu.
    #[cfg(target_os = "macos")]
    let builder = builder
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?)
        .icon_as_template(true);

    // Windows: the app icon; a left click opens the window and the menu stays on the right button.
    #[cfg(not(target_os = "macos"))]
    let builder = {
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
        let builder = builder.show_menu_on_left_click(false).on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::show_main(tray.app_handle());
            }
        });
        match app.default_window_icon() {
            Some(icon) => builder.icon(icon.clone()),
            None => builder,
        }
    };

    let icon = builder.build(app)?;
    app.manage(Tray { icon, status, mute, deafen, leave });
    Ok(())
}

pub fn set_voice(app: &AppHandle, voice: Option<&VoiceState>) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let status = match voice {
        Some(v) => format!("در «{}» · {}", v.channel, v.server),
        None => NOT_IN_VOICE.to_string(),
    };
    let _ = tray.status.set_text(status);
    let _ = tray.mute.set_enabled(voice.is_some());
    let _ = tray.mute.set_checked(voice.is_some_and(|v| v.muted));
    let _ = tray.deafen.set_enabled(voice.is_some());
    let _ = tray.deafen.set_checked(voice.is_some_and(|v| v.deafened));
    let _ = tray.leave.set_enabled(voice.is_some());
}

pub fn set_unread(app: &AppHandle, count: u32) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let tooltip = if count > 0 { format!("صدامون · {} پیام خوانده‌نشده", persian_digits(count)) } else { "صدامون".to_string() };
    let _ = tray.icon.set_tooltip(Some(tooltip));
}
