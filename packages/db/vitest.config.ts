import baseConfig from "@askai/config/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(baseConfig, {
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
