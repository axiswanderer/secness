/**
 * Stage 0 exit criterion: "Reaper removes orphaned containers in a forced-crash test."
 * A child process creates a sandbox and is SIGKILLed (no teardown runs). After the
 * sandbox's expiry, a reaper pass must remove its container and network.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LABELS } from "../../src/policy.js";
import { reap } from "../../src/reaper.js";
import { docker, ensureImage, skipDocker, TEST_IMAGE } from "./helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 5_000;

async function resourcesFor(runId: string) {
  const filters = { label: [`${LABELS.run}=${runId}`] };
  const [containers, networks] = await Promise.all([
    docker.listContainers({ all: true, filters }),
    docker.listNetworks({ filters }),
  ]);
  return { containers: containers.length, networks: networks.length };
}

describe.skipIf(skipDocker)("reaper after a forced crash (needs Docker)", () => {
  it("removes orphaned containers and networks once they expire", async () => {
    await ensureImage(TEST_IMAGE);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(here, "crash-child.ts"), String(TIMEOUT_MS)],
      {
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    const line = await new Promise<string>((resolve, reject) => {
      createInterface({ input: child.stdout! }).once("line", resolve);
      child.once("exit", (code) => reject(new Error(`child exited early with ${code}`)));
    });
    const { runId } = JSON.parse(line) as { runId: string };

    child.kill("SIGKILL");
    await new Promise((r) => child.once("exit", r));

    // The crash left resources behind, and the reaper leaves them alone before expiry.
    expect(await resourcesFor(runId)).toEqual({ containers: 1, networks: 1 });
    await reap(docker, { now: Date.now() - TIMEOUT_MS });
    expect(await resourcesFor(runId)).toEqual({ containers: 1, networks: 1 });

    await new Promise((r) => setTimeout(r, TIMEOUT_MS + 1_000));
    const report = await reap(docker);
    expect(report.errors).toEqual([]);
    expect(await resourcesFor(runId)).toEqual({ containers: 0, networks: 0 });
  });
});
