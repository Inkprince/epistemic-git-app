import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.{ts,tsx}", "eval/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["packages/*/src/**", "apps/tool/src/**"],
      exclude: ["**/*.d.ts", "**/cli.ts", "apps/tool/src/main.tsx"],
    },
  },
});
