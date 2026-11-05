// Generates every Bolbol logo asset from the geometry below.
// Run from the repo root: node design/brand/build.mjs  (needs Google Chrome for the PNGs)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const INK = "#0b0b0b";
const LIME = "#e6f7a3";
const PAPER = "#f4f2ec";

// Geometry on a 200 grid, bird faces left (toward the wordmark in RTL). Bounding-box centre (96, 94.5).
const BODY =
  "M172.5 154.5 L111.5 55.95 A20 20 0 0 0 94.5 46.5 L46.5 46.5 L76.9 68.65 A44 44 0 0 0 90.5 154.5 Z";
const EYE = { cx: 92.5, cy: 64.5, r: 6.5 };
const WING = "M138.5 142.5 L125.9 122.1 M120.5 142.5 L97.3 105.1 M102.5 142.5 L86.7 117";
const SONG = "M36.8 43.3 A12 12 0 0 0 36.8 61.7 M29.1 34.3 A24 24 0 0 0 29.1 70.7";

// Bird with eye and wing painted in `cut` (the colour behind it).
const bird = (fg, cut) => `
  <path d="${BODY}" fill="${fg}" stroke="${fg}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="${EYE.cx}" cy="${EYE.cy}" r="${EYE.r}" fill="${cut}"/>
  <path d="${WING}" stroke="${cut}" stroke-width="9" stroke-linecap="round"/>
  <path d="${SONG}" stroke="${fg}" stroke-width="6" stroke-linecap="round" fill="none"/>`;

// Bird on a transparent background: eye and wing are real holes.
const markSvg = (fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 12 164 164">
  <defs><mask id="cut">${bird("#fff", "#000").replace(/<path d="M36.8[^>]*>/, "")}</mask></defs>
  <rect x="0" y="0" width="200" height="200" fill="${fg}" mask="url(#cut)"/>
  <path d="${SONG}" stroke="${fg}" stroke-width="6" stroke-linecap="round" fill="none"/>
</svg>
`;

// Square icon. `rx` 0 = full bleed; `s` scales the bird around the centre.
const iconSvg = ({ bg = LIME, fg = INK, rx = 112, s = 2.2 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="${bg}"/>
  <g transform="translate(${256 - 96 * s} ${256 - 94.5 * s}) scale(${s})">${bird(fg, bg)}
  </g>
</svg>
`;

const FONT = `file://${ROOT}/node_modules/vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2`;
const page = (body, css = "") => `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:V;src:url("${FONT}") format("woff2");font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:V}${css}
</style></head><body>${body}</body></html>`;

const tmp = mkdtempSync(join(tmpdir(), "bolbol-"));
function render(html, out, w, h) {
  const file = join(tmp, `${w}x${h}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--default-background-color=00000000", "--virtual-time-budget=2000", "--allow-file-access-from-files",
    `--window-size=${w},${h}`, `--screenshot=${out}`, `file://${file}`,
  ], { stdio: "ignore" });
}
const png = (svg, out, size) =>
  render(page(svg.replace("<svg ", `<svg width="${size}" height="${size}" `), "svg{display:block}"), out, size, size);

const write = (rel, text) => writeFileSync(join(ROOT, rel), text);

// ---- SVG sources
write("design/brand/bolbol-mark-ink.svg", markSvg(INK));
write("design/brand/bolbol-mark-lime.svg", markSvg(LIME));
write("design/brand/bolbol-mark-paper.svg", markSvg(PAPER));
write("design/brand/bolbol-icon.svg", iconSvg());
write("design/brand/bolbol-icon-dark.svg", iconSvg({ bg: "#161616", fg: LIME }));
write("src/app/icon.svg", iconSvg());

// ---- App icons
png(iconSvg({ rx: 0 }), join(ROOT, "src/app/apple-icon.png"), 180); // iOS rounds the corners itself
png(iconSvg(), join(ROOT, "public/icons/icon-192.png"), 192);
png(iconSvg(), join(ROOT, "public/icons/icon-512.png"), 512);
png(iconSvg({ rx: 0, s: 1.85 }), join(ROOT, "public/icons/maskable-512.png"), 512);

// ---- Share image (Open Graph + Twitter)
const tile = (px, r) =>
  iconSvg({ rx: r }).replace("<svg ", `<svg width="${px}" height="${px}" `);
const chips = ["کانال صوتی", "تماس تصویری", "اشتراک صفحه", "تماشای هم‌زمان"]
  .map((t, i) => `<span class="chip${i ? "" : " on"}">${t}</span>`).join("");
const og = page(
  `<main>
    <header>${tile(76, 112)}<b>صدامون</b></header>
    <h1>تماس صوتی و تصویری<br>گروهی، <em>بدون فیلترشکن</em></h1>
    <p>سرورهای صوتی، تصویری و متنی روی شبکه‌ی داخلی</p>
    <nav>${chips}</nav>
  </main>`,
  `body{width:1200px;height:630px;background:#000;color:#f5f5f5;overflow:hidden}
  main{height:100%;padding:72px 80px;background:radial-gradient(520px 420px at 78% 98%,rgb(230 247 163/.22),transparent 70%)}
  header{display:flex;align-items:center;gap:22px}header svg{display:block}header b{font-size:46px;font-weight:800}
  h1{margin:76px 0 0;font-size:76px;line-height:1.38;font-weight:800}em{font-style:normal;color:${LIME}}
  p{margin:30px 0 0;font-size:32px;color:#a3a3a3}
  nav{display:flex;gap:16px;margin-top:26px}
  .chip{padding:14px 26px;border-radius:999px;font-size:23px;font-weight:700;background:#151515;box-shadow:inset 0 0 0 1px rgb(255 255 255/.08)}
  .chip.on{background:${LIME};color:${INK};box-shadow:none}`,
);
render(og, join(ROOT, "src/app/opengraph-image.png"), 1200, 630);
render(og, join(ROOT, "src/app/twitter-image.png"), 1200, 630);

// ---- Brand sheet for review
const lockup = (bg, fg, iconBg, iconFg) => `<div class="lock" style="background:${bg};color:${fg}">
  ${iconSvg({ bg: iconBg, fg: iconFg, rx: 112 }).replace("<svg ", '<svg width="88" height="88" ')}<b>صدامون</b></div>`;
render(
  page(
    `<div class="row">
      <div class="cell" style="background:#161616">${markSvg(LIME).replace("<svg ", '<svg width="220" ')}</div>
      <div class="cell" style="background:${PAPER}">${markSvg(INK).replace("<svg ", '<svg width="220" ')}</div>
      <div class="cell" style="background:${LIME}">${markSvg(INK).replace("<svg ", '<svg width="220" ')}</div>
      <div class="cell" style="background:#000">${tile(220, 112)}</div>
    </div>
    <div class="row">${lockup("#000", "#f5f5f5", LIME, INK)}${lockup(PAPER, INK, INK, LIME)}</div>
    <div class="row sizes" style="background:#161616">${[16, 24, 32, 48, 64, 128].map((n) => tile(n, 112)).join("")}</div>`,
    `body{width:1200px;padding:24px;background:#888;display:grid;gap:24px}
    .row{display:flex;gap:24px}.cell{flex:1;height:260px;display:grid;place-items:center;border-radius:20px}
    .lock{flex:1;height:200px;border-radius:20px;display:flex;align-items:center;justify-content:center;gap:20px}
    .lock b{font-size:56px;font-weight:800}
    .sizes{align-items:end;padding:28px;border-radius:20px;justify-content:center}`,
  ),
  join(ROOT, "design/brand/brand-sheet.png"),
  1200,
  740,
);

console.log("Bolbol assets written.");
