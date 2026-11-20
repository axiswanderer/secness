import Docker from "dockerode";
import type { SandboxSession } from "../../src/session.js";

/** Pinned test image. busybox has sh, wget, ip and httpd: everything the egress suite needs. */
export const TEST_IMAGE = "busybox:1.36.1";
export const NOBODY = "65534:65534";

export const docker = new Docker();

export const dockerAvailable = await docker.ping().then(
  () => true,
  () => false,
);

/** In CI, SECNESS_REQUIRE_DOCKER=1 turns a missing daemon into a failure rather than a skip. */
export const skipDocker = !dockerAvailable && process.env.SECNESS_REQUIRE_DOCKER !== "1";

export async function ensureImage(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    // not present; pull below
  }
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) =>
    docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve())),
  );
}

/** Splits Docker's multiplexed log stream (8-byte frame headers) into plain text. */
export function demux(buf: Buffer): string {
  let out = "";
  let i = 0;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4);
    out += buf.subarray(i + 8, i + 8 + len).toString("utf8");
    i += 8 + len;
  }
  return out;
}

let probeCount = 0;

/** Runs a shell snippet in a fresh hardened probe container on the session network. */
export async function probe(
  session: SandboxSession,
  script: string,
): Promise<{ code: number; out: string }> {
  const container = await session.start({
    role: "probe",
    image: TEST_IMAGE,
    hostname: `probe-${++probeCount}`,
    user: NOBODY,
    cmd: ["sh", "-c", script],
  });
  const { StatusCode } = (await container.wait()) as { StatusCode: number };
  const logs = (await container.logs({ stdout: true, stderr: true })) as unknown as Buffer;
  return { code: StatusCode, out: demux(logs) };
}
