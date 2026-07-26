import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // jsdom only enables localStorage for a non-opaque origin. The app uses
    // it for recent searches, so tests need the same browser capability.
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"]
  }
});
