// Bolbol — the nightingale mark. Source of truth and asset generator: design/brand/build.mjs
export function BrandMark({ className = "", radius = 112 }: { className?: string; radius?: number }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx={radius} fill="#e6f7a3" />
      <g transform="translate(44.8 48.1) scale(2.2)">
        <path
          d="M172.5 154.5 L111.5 55.95 A20 20 0 0 0 94.5 46.5 L46.5 46.5 L76.9 68.65 A44 44 0 0 0 90.5 154.5 Z"
          fill="#0b0b0b"
          stroke="#0b0b0b"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <circle cx="92.5" cy="64.5" r="6.5" fill="#e6f7a3" />
        <path
          d="M138.5 142.5 L125.9 122.1 M120.5 142.5 L97.3 105.1 M102.5 142.5 L86.7 117"
          stroke="#e6f7a3"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M36.8 43.3 A12 12 0 0 0 36.8 61.7 M29.1 34.3 A24 24 0 0 0 29.1 70.7"
          stroke="#0b0b0b"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
