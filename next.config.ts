import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Other hosts allowed to load the dev server, e.g. a phone on your Wi-Fi: DEV_ALLOWED_ORIGINS=192.168.1.20,192.168.1.21
  allowedDevOrigins: ["127.0.0.1", ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map((h) => h.trim()).filter(Boolean) ?? [])],
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Browsers must always fetch the latest service worker, or an old one can stick around for a day.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
