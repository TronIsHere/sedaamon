"use client";

import { useEffect, useRef } from "react";

/** Final cell size in CSS pixels, and the coarse size the picture resolves from as the page opens. */
const CELL = 6;
const INTRO_CELL = 30;
const INTRO_MS = 1400;
const FRAME_MS = 1000 / 30;
/** Where the crop sits vertically when the panel is wider than the clip (0 top, 1 bottom): on the mascot. */
const FOCUS_Y = 0.75;

/**
 * The sign-in illustration drawn as a grid of small LED cells: the looping clip (or its still poster
 * when motion is reduced or the clip has not loaded) is sampled down to one colour per cell and
 * repainted every frame. The plain video sits underneath, so the picture still shows without canvas.
 */
export default function PixelScene({ src, poster, className }: { src: string; poster: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext("2d");
    const sample = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!canvas || !video || !ctx || !sample) return;

    const still = new Image();
    still.src = poster;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) video.play().catch(() => {});

    const start = performance.now();
    let raf = 0;
    let last = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < FRAME_MS) return;
      last = now;

      const fromVideo = !reduced && video.readyState >= 2;
      const source = fromVideo ? video : still.complete && still.naturalWidth ? still : null;
      // A hidden panel (display: none on small screens) has no client size, and a stale canvas size would divide by it.
      if (!source || !canvas.width || !canvas.height || !canvas.clientWidth) return;
      const sw = fromVideo ? video.videoWidth : still.naturalWidth;
      const sh = fromVideo ? video.videoHeight : still.naturalHeight;

      const t = reduced ? 1 : Math.min((now - start) / INTRO_MS, 1);
      const dpr = canvas.width / canvas.clientWidth;
      const cell = (CELL + (INTRO_CELL - CELL) * (1 - t) ** 3) * dpr;
      const cols = Math.ceil(canvas.width / cell);
      const rows = Math.ceil(canvas.height / cell);

      // One sampled pixel per cell, cropped like object-fit: cover and kept low enough to show the mascot.
      if (sample.canvas.width !== cols || sample.canvas.height !== rows) {
        sample.canvas.width = cols;
        sample.canvas.height = rows;
      }
      const scale = Math.max(cols / sw, rows / sh);
      sample.drawImage(source, (cols - sw * scale) / 2, (rows - sh * scale) * FOCUS_Y, sw * scale, sh * scale);
      const px = sample.getImageData(0, 0, cols, rows).data;

      const gap = Math.max(1, cell * 0.18);
      const size = cell - gap;
      // The gaps between cells carry a dimmed copy of the picture, like an unlit LED panel.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sample.canvas, 0, 0, cols * cell, rows * cell);
      ctx.fillStyle = "rgb(0 0 0 / 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          ctx.fillStyle = `rgb(${px[i]} ${px[i + 1]} ${px[i + 2]})`;
          ctx.fillRect(x * cell + gap / 2, y * cell + gap / 2, size, size);
        }
      }
      // With reduced motion the still picture never changes: paint it once and stop.
      if (reduced) cancelAnimationFrame(raf);
    };

    // Only spend frames while the panel is on screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (reduced) return;
      if (visible) video.play().catch(() => {});
      else video.pause();
    });
    const ro = new ResizeObserver(() => {
      resize();
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    ro.observe(canvas);
    still.onload = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [poster]);

  return (
    <div aria-hidden className={`overflow-hidden bg-ink-850 ${className ?? "relative"}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 size-full object-cover object-[50%_75%]"
      />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
