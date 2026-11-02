// PM2 process file: `pm2 start ecosystem.config.cjs` (after `npm run build`).
module.exports = {
  apps: [
    {
      name: "sedaamon-web",
      // Next.js + Socket.io in one process (server.ts), run through tsx.
      script: "node_modules/.bin/tsx",
      args: "server.ts",
      interpreter: "none",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
    },
    {
      name: "sedaamon-livekit",
      script: "livekit-server",
      args: "--config livekit.yaml",
      interpreter: "none",
    },
  ],
};
