import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Only the app's own tests; worktrees under .claude carry copies of the whole repo.
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Database tests share one connection per file and can take a moment on a cold MongoDB.
    testTimeout: 20_000,
  },
});
