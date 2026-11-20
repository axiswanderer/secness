/**
 * Fixture for the forced-crash reaper test. Creates a sandbox with a short timeout,
 * prints the run id, then hangs until the parent SIGKILLs it, so no teardown code runs.
 */
import { newId } from "@secness/schema";
import { SandboxSession } from "../../src/session.js";
import { NOBODY, TEST_IMAGE } from "./helpers.js";

const runId = newId("run");
const timeoutMs = Number(process.argv[2] ?? "5000");
const session = await SandboxSession.create({ runId, limits: { timeoutMs } });
await session.start({
  role: "app",
  image: TEST_IMAGE,
  hostname: "orphan",
  user: NOBODY,
  cmd: ["sleep", "3600"],
});
process.stdout.write(JSON.stringify({ runId }) + "\n");
setInterval(() => undefined, 1 << 30);
