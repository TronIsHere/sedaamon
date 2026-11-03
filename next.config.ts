import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["127.0.0.1", "172.20.10.5"], // TEMP-VERIFY
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
