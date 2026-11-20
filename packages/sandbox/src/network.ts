import type Docker from "dockerode";
import { LABELS, networkNameFor } from "./policy.js";

/** Creates the run's private network. `Internal: true` means Docker gives it no route out. */
export async function createRunNetwork(
  docker: Docker,
  runId: string,
  expiresAt: number,
): Promise<Docker.Network> {
  const name = networkNameFor(runId);
  const network = await docker.createNetwork({
    Name: name,
    Driver: "bridge",
    Internal: true,
    Attachable: false,
    EnableIPv6: false,
    CheckDuplicate: true,
    Labels: {
      [LABELS.managed]: "true",
      [LABELS.run]: runId,
      [LABELS.expires]: String(expiresAt),
    },
  });
  const info = (await network.inspect()) as { Internal?: boolean };
  if (info.Internal !== true) {
    await network.remove().catch(() => undefined);
    throw new Error(`network ${name} was created without Internal=true; refusing to use it`);
  }
  return network;
}
