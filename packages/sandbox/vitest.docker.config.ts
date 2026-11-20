import { defineConfig } from "vitest/config";

/** Sandbox escape and egress suite. Needs a Docker daemon. Runs in CI on every sandbox change. */
export default defineConfig({
  test: {
    include: ["test/docker/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
