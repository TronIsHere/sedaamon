//! The unread count on the Dock icon (macOS) or as an overlay on the taskbar button (Windows).

use tauri::image::Image;
use tauri::{AppHandle, Manager};

pub fn set(app: &AppHandle, count: u32) {
    crate::tray::set_unread(app, count);
    let Some(window) = app.get_webview_window("main") else { return };
    // The Dock takes any label, so the count is written the way the app writes numbers.
    #[cfg(target_os = "macos")]
    let _ = window.set_badge_label((count > 0).then(|| persian_digits(count)));
    // The taskbar has no badge, only a small icon drawn over the app's.
    #[cfg(windows)]
    let _ = window.set_overlay_icon((count > 0).then(|| overlay(count)));
    #[cfg(target_os = "linux")]
    let _ = window.set_badge_count((count > 0).then_some(i64::from(count)));
}

pub fn persian_digits(n: u32) -> String {
    n.to_string().chars().map(|c| char::from_u32(0x06F0 + c.to_digit(10).unwrap_or(0)).unwrap_or(c)).collect()
}

const OVERLAY_SIZE: usize = 32;

/// 3×5 pixel glyphs, one row per byte, high bit on the left.
fn glyph(c: char) -> Option<[u8; 5]> {
    Some(match c {
        '0' => [0b111, 0b101, 0b101, 0b101, 0b111],
        '1' => [0b010, 0b110, 0b010, 0b010, 0b111],
        '2' => [0b111, 0b001, 0b111, 0b100, 0b111],
        '3' => [0b111, 0b001, 0b111, 0b001, 0b111],
        '4' => [0b101, 0b101, 0b111, 0b001, 0b001],
        '5' => [0b111, 0b100, 0b111, 0b001, 0b111],
        '6' => [0b111, 0b100, 0b111, 0b101, 0b111],
        '7' => [0b111, 0b001, 0b001, 0b001, 0b001],
        '8' => [0b111, 0b101, 0b111, 0b101, 0b111],
        '9' => [0b111, 0b101, 0b111, 0b001, 0b111],
        '+' => [0b000, 0b010, 0b111, 0b010, 0b000],
        _ => return None,
    })
}

/// A red disc with the count in white: one digit, or "9+" for more.
#[cfg_attr(not(windows), allow(dead_code))]
fn overlay(count: u32) -> Image<'static> {
    const S: usize = OVERLAY_SIZE;
    let (text, scale) = if count < 10 { (count.to_string(), 4) } else { ("9+".to_string(), 3) };
    let mut rgba = vec![0u8; S * S * 4];

    // The disc, its edge softened over one pixel.
    let center = S as f32 / 2.0;
    for y in 0..S {
        for x in 0..S {
            let d = ((x as f32 + 0.5 - center).powi(2) + (y as f32 + 0.5 - center).powi(2)).sqrt();
            let alpha = (center - d).clamp(0.0, 1.0);
            rgba[(y * S + x) * 4..][..4].copy_from_slice(&[0xF2, 0x3F, 0x43, (alpha * 255.0) as u8]);
        }
    }

    let glyphs: Vec<[u8; 5]> = text.chars().filter_map(glyph).collect();
    let width = glyphs.len() * 4 * scale - scale;
    let (left, top) = ((S - width) / 2, (S - 5 * scale) / 2);
    for (n, rows) in glyphs.iter().enumerate() {
        for (row, bits) in rows.iter().enumerate() {
            for col in 0..3 {
                if bits >> (2 - col) & 1 == 0 {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let (x, y) = (left + n * 4 * scale + col * scale + dx, top + row * scale + dy);
                        rgba[(y * S + x) * 4..][..4].copy_from_slice(&[255, 255, 255, 255]);
                    }
                }
            }
        }
    }
    Image::new_owned(rgba, S as u32, S as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_persian_digits() {
        assert_eq!(persian_digits(1209), "۱۲۰۹");
    }

    #[test]
    fn draws_the_count_inside_the_disc() {
        for count in [1, 7, 9, 10, 250] {
            let image = overlay(count);
            let px = |x: usize, y: usize| &image.rgba()[(y * OVERLAY_SIZE + x) * 4..][..4];
            assert_eq!(px(0, 0)[3], 0, "corner stays clear");
            let white = (0..OVERLAY_SIZE * OVERLAY_SIZE).filter(|i| image.rgba()[i * 4..][..3] == [255, 255, 255]).count();
            assert!(white > 0, "{count} draws its text");
        }
    }
}
