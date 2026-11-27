import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * The store's showpiece frames: drawn art that reaches past the picture and moves (lightning, a halo over clouds,
 * falling snow, petals, smoke). The art is an SVG laid over the avatar, 1.4× its size, in a box where the picture is a
 * circle of radius 50 at the centre. The movement is CSS (`.fa-*` in globals.css), so the reduced-motion rule there
 * stops it; anything that only exists while moving (falling flakes, ripples) starts invisible and disappears with it.
 * The simpler frames are plain CSS rings (`.frame-<name>`), drawn by Avatar.
 */

type Art = (id: string) => ReactNode;

/** A point at `deg` degrees (0 = right, 90 = down) and radius `r` from the centre. */
function at(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [round(r * Math.cos(a)), round(r * Math.sin(a))];
}
const round = (n: number) => Math.round(n * 100) / 100;

/** The same "random" numbers on every render and on the server, so the art never shifts between paints. */
function noise(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Animation timing as an inline style. Negative delays start a loop part-way through, so nothing waits to appear. */
const anim = (duration: number, delay = 0, extra?: CSSProperties): CSSProperties => ({
  animationDuration: `${duration}s`,
  animationDelay: `${delay}s`,
  ...extra,
});

/** A soft halo behind a shape: its own blur under the sharp original. */
function Glow({ id, blur }: { id: string; blur: number }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation={blur} result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Four-pointed sparkle, 12 across. */
const SPARKLE = "M0-6C.8-1.2 1.2-.8 6 0 1.2.8.8 1.2 0 6-.8 1.2-1.2.8-6 0-1.2-.8-.8-1.2 0-6Z";

/** Things that drift down across the frame: snow, petals. */
const FALLING = Array.from({ length: 14 }, (_, i) => ({
  x: round(-56 + noise(i + 1) * 112),
  size: round(0.8 + noise(i + 40) * 1.2),
  duration: round(4.5 + noise(i + 80) * 4),
  delay: round(-noise(i + 120) * 8),
  drift: round(-8 + noise(i + 160) * 16),
}));

function Falling({ children, spin = 0 }: { children: (size: number) => ReactNode; spin?: number }) {
  return FALLING.map((f, i) => (
    <g key={i} transform={`translate(${f.x} 0)`}>
      <g className="fa-fall" opacity={0} style={anim(f.duration, f.delay, { "--dx": `${f.drift}px`, "--rot": `${spin}deg` } as CSSProperties)}>
        {children(f.size)}
      </g>
    </g>
  ));
}

// ---- Lightning ---------------------------------------------------------------------------------

/** A bolt along the ring from `from` to `to` degrees: a few long, uneven strokes, each a random way in or out. */
function bolt(from: number, to: number, steps: number, seed: number): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => [
    from + ((to - from) * (i + (noise(seed + i + 50) - 0.5) * 0.7)) / steps,
    i === 0 || i === steps ? 54 : 50 + noise(seed + i) * 12,
  ]);
}
const line = (pts: [number, number][]) => pts.map(([deg, r]) => at(deg, r).join(",")).join(" ");
const BOLTS = [-110, -20, 60, 150, 230].map((start, b) => {
  const pts = bolt(start, start + 60 + noise(b) * 30, 7, b * 31);
  // A short fork off one corner, pointing away from the picture.
  const [deg, r] = pts[3];
  return { main: line(pts), fork: line([[deg, r], [deg + 4, r + 5], [deg + 2, r + 10]]) };
});

const lightning: Art = (id) => (
  <>
    <defs>
      <Glow id={`${id}g`} blur={2.4} />
    </defs>
    <circle r={53} fill="none" stroke="#713f12" strokeWidth={4} />
    <circle r={53} fill="none" stroke="#fde047" strokeWidth={1.6} filter={`url(#${id}g)`} className="fa-pulse" style={anim(1.1)} />
    <g filter={`url(#${id}g)`} stroke="#fefce8" strokeWidth={1.3} strokeLinejoin="miter" fill="none">
      {BOLTS.map((b, i) => (
        <g key={i} className="fa-flicker" style={anim(1.3 + i * 0.41, -i * 0.53)}>
          <polyline points={b.main} />
          <polyline points={b.fork} strokeWidth={0.9} />
        </g>
      ))}
    </g>
  </>
);

// ---- Halo and clouds ---------------------------------------------------------------------------

const CLOUD: [number, number, number][] = [
  [-48, 38, 9], [-38, 49, 12], [-22, 57, 12], [-6, 61, 12], [10, 60, 12], [26, 55, 12], [40, 46, 11], [50, 34, 8],
  [-58, 26, 6], [58, 22, 6], [-30, 64, 8], [18, 66, 8],
];
const WING = "M0 0C6-9 18-11 25-6 19-5 17-2 21 0 15 0 12 2 14 5 8 4 3 3 0 0Z";

const halo: Art = (id) => (
  <>
    <defs>
      <Glow id={`${id}g`} blur={1.8} />
      <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fde68a" stopOpacity={0.7} />
        <stop offset="1" stopColor="#fde68a" stopOpacity={0} />
      </linearGradient>
    </defs>
    <circle r={52} fill="none" stroke="#fef3c7" strokeOpacity={0.75} strokeWidth={2} filter={`url(#${id}g)`} />
    <g className="fa-bob" style={anim(3.2)}>
      <path d="M-15-61-24-40H24L15-61Z" fill={`url(#${id}r)`} opacity={0.6} className="fa-pulse" style={anim(2.6)} />
      <g transform="translate(22 -63)">
        <path d={WING} fill="#fff" className="fa-flap" style={anim(1.6)} />
      </g>
      <g transform="translate(-22 -63) scale(-1 1)">
        <path d={WING} fill="#fff" className="fa-flap" style={anim(1.6)} />
      </g>
      <ellipse cy={-63} rx={19} ry={4.5} fill="none" stroke="#fcd34d" strokeWidth={2.6} filter={`url(#${id}g)`} />
    </g>
    <g className="fa-drift" style={anim(7)}>
      {CLOUD.map(([x, y, r], i) => (
        <circle key={`s${i}`} cx={x + 1} cy={y + 2.5} r={r} fill="#a5b4fc" opacity={0.55} />
      ))}
      {CLOUD.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#f8fafc" />
      ))}
    </g>
  </>
);

// ---- Moon and stars ----------------------------------------------------------------------------

const STARS: [number, number, number][] = [
  [52, -46, 7], [62, -8, 3.5], [46, 47, 8], [-6, 63, 3.5], [-58, 24, 5], [-32, 56, 3], [18, -63, 3.5], [63, 26, 3], [-63, -6, 3],
];
const DOTS: [number, number][] = [[34, -58], [-20, -62], [58, 44], [-52, 44], [8, 64], [-62, 12]];

const moonlit: Art = (id) => (
  <>
    <defs>
      <Glow id={`${id}g`} blur={1.6} />
      <mask id={`${id}m`}>
        <circle cx={-45} cy={-45} r={12} fill="#fff" />
        <circle cx={-39} cy={-50} r={10.5} fill="#000" />
      </mask>
    </defs>
    <g className="fa-orbit" style={anim(60)}>
      <circle r={54} fill="none" stroke="#bfdbfe" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="2 5" />
    </g>
    <circle r={51.5} fill="none" stroke="#93c5fd" strokeOpacity={0.5} strokeWidth={1.2} />
    <g className="fa-rock" style={anim(6)}>
      <circle cx={-45} cy={-45} r={12} fill="#fef9c3" mask={`url(#${id}m)`} filter={`url(#${id}g)`} />
    </g>
    {STARS.map(([x, y, s], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${s / 6})`}>
        <path d={SPARKLE} fill="#fff" filter={`url(#${id}g)`} className="fa-twinkle" style={anim(1.8 + noise(i) * 2, -noise(i + 9) * 3)} />
      </g>
    ))}
    {DOTS.map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={1.3} fill="#e0f2fe" className="fa-twinkle" style={anim(2.4 + noise(i + 20) * 2, -noise(i + 30) * 3)} />
    ))}
  </>
);

// ---- Snow --------------------------------------------------------------------------------------

function Snowflake({ size }: { size: number }) {
  return (
    <g stroke="#f0f9ff" strokeWidth={1.3} strokeLinecap="round" transform={`scale(${size / 12})`}>
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <g key={deg} transform={`rotate(${deg})`}>
          <path d="M0 0V-12M0-7-3.5-10M0-7 3.5-10M0-3.5-2.5-5.5M0-3.5 2.5-5.5" fill="none" />
        </g>
      ))}
    </g>
  );
}

/** Snow resting on the bottom of the ring, bumpy on top. */
const DRIFT = (() => {
  const top = Array.from({ length: 25 }, (_, i) => {
    const deg = 28 + i * 5;
    return at(deg, 55 + Math.abs(Math.sin(i * 1.3)) * 4 + (i > 3 && i < 21 ? 2 : 0)).join(",");
  });
  const bottom = Array.from({ length: 25 }, (_, i) => at(148 - i * 5, 48).join(","));
  return `M${top.join(" L")} L${bottom.join(" L")}Z`;
})();

const snow: Art = (id) => (
  <>
    <defs>
      <Glow id={`${id}g`} blur={1.4} />
    </defs>
    <circle r={53} fill="none" stroke="#bae6fd" strokeWidth={3} filter={`url(#${id}g)`} />
    <circle r={56} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="1 3.5" />
    <path d={DRIFT} fill="#e0f2fe" opacity={0.6} transform="translate(0 2)" />
    <path d={DRIFT} fill="#f8fafc" stroke="#bae6fd" strokeWidth={0.6} />
    <g transform="translate(44 -46)" filter={`url(#${id}g)`}>
      <g className="fa-spin" style={anim(14)}>
        <Snowflake size={13} />
      </g>
    </g>
    <g transform="translate(-56 -26)">
      <g className="fa-spin" style={anim(18, 0, { animationDirection: "reverse" })}>
        <Snowflake size={7} />
      </g>
    </g>
    <Falling>{(size) => <circle r={size} fill="#fff" />}</Falling>
  </>
);

// ---- Blossoms ----------------------------------------------------------------------------------

function Blossom() {
  return (
    <>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cy={-4.4} rx={3.3} ry={4.6} fill="#fbcfe8" stroke="#f472b6" strokeWidth={0.5} transform={`rotate(${deg})`} />
      ))}
      <circle r={1.9} fill="#fde047" />
    </>
  );
}
const BLOSSOMS: [number, number][] = [
  [-130, 1.25], [-95, 0.8], [-60, 1.05], [-20, 0.75], [15, 1.15], [55, 0.85], [95, 1], [130, 0.75], [165, 1.2], [205, 0.85],
];

const blossom: Art = () => (
  <>
    <circle r={52.5} fill="none" stroke="#f9a8d4" strokeWidth={2} />
    <circle r={55.5} fill="none" stroke="#fce7f3" strokeOpacity={0.6} strokeWidth={0.8} strokeDasharray="3 4" />
    {BLOSSOMS.map(([deg, s], i) => {
      const [x, y] = at(deg, 55);
      return (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <g className="fa-sway" style={anim(2.6 + noise(i) * 2, -noise(i + 5) * 3)}>
            <Blossom />
          </g>
        </g>
      );
    })}
    <Falling spin={320}>{(size) => <ellipse rx={1.4 * size} ry={2.2 * size} fill="#f9a8d4" />}</Falling>
  </>
);

// ---- Shadow fire -------------------------------------------------------------------------------

const EMBERS = Array.from({ length: 12 }, (_, i) => ({ deg: i * 30 + noise(i) * 20, r: 53 + noise(i + 3) * 5, size: 3 + noise(i + 7) * 4 }));

const shadowfire: Art = (id) => (
  <>
    <defs>
      <filter id={`${id}f`} x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves={2} seed={4} />
        <feDisplacementMap in="SourceGraphic" scale={13} xChannelSelector="R" yChannelSelector="G" result="d" />
        <feGaussianBlur in="d" stdDeviation={0.7} />
      </filter>
      <filter id={`${id}b`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={4} />
      </filter>
    </defs>
    <circle r={55} fill="none" stroke="#a855f7" strokeWidth={9} opacity={0.4} filter={`url(#${id}b)`} className="fa-pulse" style={anim(2.2)} />
    {/* The flames turn under a still noise pattern, so their edges keep changing shape. */}
    <g filter={`url(#${id}f)`}>
      <g className="fa-orbit" style={anim(7)}>
        <circle r={54} fill="none" stroke="#581c87" strokeWidth={8} />
        {EMBERS.map((e, i) => {
          const [x, y] = at(e.deg, e.r);
          return <circle key={i} cx={x} cy={y} r={e.size} fill="#6b21a8" />;
        })}
      </g>
      <g className="fa-orbit" style={anim(4.6, 0, { animationDirection: "reverse" })}>
        <circle r={53} fill="none" stroke="#c084fc" strokeWidth={2.4} />
        {EMBERS.map((e, i) => {
          const [x, y] = at(e.deg + 15, e.r - 1);
          return <circle key={i} cx={x} cy={y} r={e.size * 0.45} fill="#e9d5ff" opacity={0.85} />;
        })}
      </g>
    </g>
    <circle r={50.8} fill="none" stroke="#1e0b36" strokeWidth={1.6} />
  </>
);

// ---- Thorns ------------------------------------------------------------------------------------

function vine(phase: number) {
  const pts = Array.from({ length: 91 }, (_, i) => {
    const deg = i * 4;
    return at(deg, 54 + 2.6 * Math.sin(((deg * 6 + phase) * Math.PI) / 180)).join(",");
  });
  return `M${pts.join(" L")}Z`;
}
const VINES = [vine(0), vine(180)];
/** A thorn on each outward bend of either vine. */
const THORNS = Array.from({ length: 12 }, (_, i) => {
  const deg = 15 + i * 30;
  const [a, b, tip] = [at(deg - 3.5, 55.5), at(deg + 3.5, 55.5), at(deg + 2, 63)];
  return `M${a} L${tip} L${b}Z`;
});
const BUDS = [-60, 60, 180];

const thorns: Art = (id) => (
  <>
    <defs>
      <filter id={`${id}b`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={3.5} />
      </filter>
    </defs>
    <circle r={54} fill="none" stroke="#ef4444" strokeWidth={7} opacity={0} filter={`url(#${id}b)`} className="fa-beat" style={anim(1.6)} />
    <g className="fa-orbit" style={anim(80)}>
      <path d={VINES[0]} fill="none" stroke="#7f1d1d" strokeWidth={2.4} />
      <path d={VINES[1]} fill="none" stroke="#b91c1c" strokeWidth={1.6} />
      {THORNS.map((d, i) => (
        <path key={i} d={d} fill="#dc2626" />
      ))}
      {BUDS.map((deg) => {
        const [x, y] = at(deg, 55);
        return (
          <g key={deg} transform={`translate(${x} ${y})`}>
            <circle r={4.2} fill="#991b1b" />
            <path d="M-2.4 0A2.4 2.4 0 1 1 0 2.4 1.4 1.4 0 1 1 1.2 0" fill="none" stroke="#fca5a5" strokeWidth={0.8} />
          </g>
        );
      })}
    </g>
  </>
);

// ---- Cyberpunk ---------------------------------------------------------------------------------

const BRACKET = "M-64-46V-64H-46";

const cyber: Art = (id) => (
  <>
    <defs>
      <Glow id={`${id}g`} blur={1.2} />
      <path id={`${id}t`} d="M-63 0A63 63 0 0 1 63 0" />
    </defs>
    <circle r={51.5} fill="none" stroke="#facc15" strokeWidth={1.2} />
    <g filter={`url(#${id}g)`}>
      <g className="fa-orbit" style={anim(9)}>
        <circle r={56.5} fill="none" stroke="#facc15" strokeWidth={3.2} strokeDasharray="30 6 8 6 52 12 18 6" />
      </g>
    </g>
    <g className="fa-glitch" opacity={0} style={anim(3.4)}>
      <circle r={56.5} fill="none" stroke="#22d3ee" strokeWidth={3.2} strokeDasharray="30 6 8 6 52 12 18 6" />
    </g>
    <g className="fa-orbit" style={anim(16, 0, { animationDirection: "reverse" })}>
      <circle r={61} fill="none" stroke="#fde047" strokeOpacity={0.7} strokeWidth={1.4} strokeDasharray="1 3" />
    </g>
    <g fill="none" stroke="#facc15" strokeWidth={2.2}>
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} d={BRACKET} transform={`rotate(${deg})`} />
      ))}
    </g>
    <text fontSize={5} fill="#facc15" fontFamily="ui-monospace, monospace" letterSpacing={1} direction="ltr">
      <textPath href={`#${id}t`} startOffset="50%" textAnchor="middle">
        SEDA//NET · 0x5EDA · ONLINE
      </textPath>
    </text>
    <rect x={44} y={50} width={5} height={5} fill="#22d3ee" className="fa-blink" style={anim(1.2)} />
  </>
);

// ---- Pulse -------------------------------------------------------------------------------------

const pulse: Art = (id) => (
  <>
    <defs>
      <Glow id={`${id}g`} blur={2} />
    </defs>
    <circle r={53} fill="none" stroke="#450a0a" strokeWidth={3} />
    {[0, 0.22].map((delay) => (
      <circle key={delay} r={53} fill="none" stroke="#ef4444" strokeWidth={1.6} opacity={0} className="fa-ripple" style={anim(1.6, delay)} />
    ))}
    {/* A comet: a long faint tail behind a short bright head, all on one turning ring. */}
    <g className="fa-orbit" style={anim(2.4)} filter={`url(#${id}g)`}>
      <circle r={53} fill="none" stroke="#ef4444" strokeOpacity={0.35} strokeWidth={3} strokeDasharray="60 273" />
      <circle r={53} fill="none" stroke="#f87171" strokeOpacity={0.8} strokeWidth={3} strokeDasharray="28 305" strokeDashoffset={-32} />
      <circle r={53} fill="none" stroke="#fee2e2" strokeWidth={3.4} strokeDasharray="8 325" strokeDashoffset={-52} />
    </g>
  </>
);

// ---- Shamseh -----------------------------------------------------------------------------------

/** Sixteen sun rays, long and short in turn, like the شمسه at the centre of a tiled dome or a book's opening page. */
const RAYS = Array.from({ length: 16 }, (_, i) => {
  const deg = i * 22.5;
  const tip = at(deg, i % 2 ? 61 : 67);
  return `M${at(deg - 5, 53)} L${tip} L${at(deg + 5, 53)}Z`;
});
const BEADS = Array.from({ length: 16 }, (_, i) => at(i * 22.5 + 11.25, 56));

const shamseh: Art = (id) => (
  <>
    <defs>
      <Glow id={`${id}g`} blur={1.6} />
      <radialGradient id={`${id}r`} r="0.5">
        <stop offset="0.75" stopColor="#b45309" />
        <stop offset="0.85" stopColor="#fbbf24" />
        <stop offset="1" stopColor="#fef3c7" />
      </radialGradient>
    </defs>
    <g className="fa-orbit" style={anim(40)}>
      <g filter={`url(#${id}g)`} className="fa-pulse" style={anim(3)}>
        {RAYS.map((d, i) => (
          <path key={i} d={d} fill={`url(#${id}r)`} stroke="#92400e" strokeWidth={0.4} />
        ))}
      </g>
      {BEADS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.5} fill="#2dd4bf" />
      ))}
    </g>
    <circle r={52.5} fill="none" stroke="#b45309" strokeWidth={3.4} />
    <circle r={52.5} fill="none" stroke="#fde68a" strokeWidth={1.2} strokeDasharray="2 2.2" />
  </>
);

const ART: Record<string, Art> = {
  "frame:lightning": lightning,
  "frame:halo": halo,
  "frame:moonlit": moonlit,
  "frame:snow": snow,
  "frame:blossom": blossom,
  "frame:shadowfire": shadowfire,
  "frame:thorns": thorns,
  "frame:cyber": cyber,
  "frame:pulse": pulse,
  "frame:shamseh": shamseh,
};

export const hasFrameArt = (frame: string | null | undefined) => !!frame && frame in ART;

/** The drawn frame for `frame`, laid over an avatar; place it inside a relatively positioned box the picture's size. */
export default function FrameArt({ frame }: { frame: string }) {
  // Several avatars share a page, so every gradient, mask and filter id has to be its own.
  const id = `fa${useId().replace(/[^\w-]/g, "")}`;
  const art = ART[frame];
  if (!art) return null;
  return (
    <svg aria-hidden viewBox="-70 -70 140 140" className="frame-art">
      {art(id)}
    </svg>
  );
}
