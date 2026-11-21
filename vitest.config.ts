import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Test-only values. Real secrets live in .dev.vars / Wrangler secrets.
        bindings: { ADMIN_SECRET: "test-admin-secret", PLAYER_POLL_MS: "5", LEAGUE_RETRY_MS: "20", GEMINI_API_KEY: "test-gemini-key", OPENROUTER_API_KEY: "test-openrouter-key", AGENT37_API_KEY: "test-agent37-key" },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
