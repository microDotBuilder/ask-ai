import baseConfig from "@askai/config/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(baseConfig, {
  test: {
    css: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://example.com/",
      },
    },
    exclude: ["**/e2e/**", "**/node_modules/**"],
    setupFiles: ["./test/setup.ts"],
  },
});
