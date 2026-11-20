import Docker from "dockerode";
import { buildContainerSpec, type ContainerSpecInput } from "./container-spec.js";
import { createRunNetwork } from "./network.js";
import { resolveLimits, type ResourceLimits } from "./policy.js";
import { reap, type ReapReport } from "./reaper.js";
import { assertNoHostSecrets } from "./secrets.js";
import { TargetAllowlist } from "./allowlist.js";

export type SessionContainerInput = Omit<ContainerSpecInput, "runId" | "expiresAt" | "limits">;

/**
 * One run's sandbox: a private internal network plus hardened containers on it.
 * teardown() removes everything; if the process dies first, the reaper does it at expiry.
 */
export class SandboxSession {
  private readonly containers: Docker.Container[] = [];
  private readonly hostnames = new Set<string>();

  private constructor(
    readonly docker: Docker,
    readonly runId: string,
    readonly limits: ResourceLimits,
    readonly expiresAt: number,
    readonly network: Docker.Network,
  ) {}

  static async create(opts: {
    runId: string;
    docker?: Docker;
    limits?: Partial<ResourceLimits>;
  }): Promise<SandboxSession> {
    const docker = opts.docker ?? new Docker();
    const limits = resolveLimits(opts.limits);
    const expiresAt = Date.now() + limits.timeoutMs;
    const network = await createRunNetwork(docker, opts.runId, expiresAt);
    return new SandboxSession(docker, opts.runId, limits, expiresAt, network);
  }

  async start(input: SessionContainerInput): Promise<Docker.Container> {
    assertNoHostSecrets(input.env ?? {});
    const spec = buildContainerSpec({
      ...input,
      runId: this.runId,
      limits: this.limits,
      expiresAt: this.expiresAt,
    });
    const container = await this.docker.createContainer(spec);
    this.containers.push(container);
    if (input.role !== "scanner" && input.role !== "probe") this.hostnames.add(input.hostname);
    await container.start();
    return container;
  }

  /** Hostnames of the app's own services: the only targets scanners may hit. */
  allowlist(): TargetAllowlist {
    return new TargetAllowlist(this.hostnames);
  }

  async teardown(): Promise<ReapReport> {
    return reap(this.docker, { runId: this.runId, force: true });
  }
}
