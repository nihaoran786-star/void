import type { ConfigEnv } from "vite";
import { describe, expect, it } from "vitest";

import configExport from "./vite.config";

async function resolveDevelopmentConfig() {
  const env: ConfigEnv = {
    command: "serve",
    mode: "development",
    isSsrBuild: false,
    isPreview: false,
  };

  return typeof configExport === "function"
    ? await configExport(env)
    : await configExport;
}

describe("Vite development server", () => {
  it("uses native file watching instead of CPU-heavy polling", async () => {
    const config = await resolveDevelopmentConfig();

    expect(config.server?.watch?.usePolling).not.toBe(true);
  });
});
