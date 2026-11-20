import path from "node:path";
import type Docker from "dockerode";
import {
  DEFAULT_USER,
  LABELS,
  NETWORK_PREFIX,
  networkNameFor,
  resolveLimits,
  type ContainerRole,
  type ResourceLimits,
} from "./policy.js";

export interface ContainerSpecInput {
  runId: string;
  role: ContainerRole;
  image: string;
  /** DNS name other containers on the run network use to reach this one. */
  hostname: string;
  cmd?: string[];
  entrypoint?: string[];
  /** Must contain only generated fakes. See secrets.ts. */
  env?: Record<string, string>;
  /** uid:gid. Root is refused. */
  user?: string;
  workingDir?: string;
  /** Read-only root FS. Default true; an app that cannot run read-only may opt out. */
  readOnlyRootfs?: boolean;
  /** Writable tmpfs mounts (noexec, nosuid). Default ["/tmp"]. */
  tmpfs?: string[];
  /** The only host mount allowed: the run's snapshot of the source tree, always read-only. */
  source?: { hostPath: string; containerPath: string };
  limits?: Partial<ResourceLimits>;
  /** Absolute expiry; defaults to now + limits.timeoutMs. */
  expiresAt?: number;
}

export class UnsafeSandboxSpecError extends Error {
  constructor(readonly problems: string[]) {
    super(`Refusing unsafe sandbox container spec: ${problems.join("; ")}`);
    this.name = "UnsafeSandboxSpecError";
  }
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Builds the dockerode create options for a hardened sandbox container. */
export function buildContainerSpec(
  input: ContainerSpecInput,
  now: number = Date.now(),
): Docker.ContainerCreateOptions {
  const limits = resolveLimits(input.limits);
  const network = networkNameFor(input.runId);
  const expiresAt = input.expiresAt ?? now + limits.timeoutMs;
  const tmpfs = input.tmpfs ?? ["/tmp"];
  const env = Object.entries(input.env ?? {}).map(([k, v]) => {
    if (!ENV_NAME_RE.test(k)) throw new UnsafeSandboxSpecError([`invalid env var name ${k}`]);
    return `${k}=${v}`;
  });

  const spec: Docker.ContainerCreateOptions = {
    name: `secness-${input.runId.toLowerCase()}-${input.hostname}`,
    Image: input.image,
    Hostname: input.hostname,
    User: input.user ?? DEFAULT_USER,
    Env: env,
    Labels: {
      [LABELS.managed]: "true",
      [LABELS.run]: input.runId,
      [LABELS.expires]: String(expiresAt),
      [LABELS.role]: input.role,
    },
    NetworkDisabled: false,
    HostConfig: {
      NetworkMode: network,
      CapDrop: ["ALL"],
      CapAdd: [],
      Privileged: false,
      // Docker's default seccomp profile applies unless explicitly disabled; we never disable it.
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: input.readOnlyRootfs ?? true,
      Tmpfs: Object.fromEntries(tmpfs.map((p) => [p, "rw,noexec,nosuid,nodev,size=256m"])),
      NanoCpus: Math.round(limits.cpus * 1e9),
      Memory: limits.memoryBytes,
      MemorySwap: limits.memoryBytes, // no swap beyond the memory limit
      PidsLimit: limits.pids,
      Binds: input.source
        ? [`${path.resolve(input.source.hostPath)}:${input.source.containerPath}:ro`]
        : [],
      PortBindings: {},
      PublishAllPorts: false,
      ExtraHosts: [],
      Devices: [],
      RestartPolicy: { Name: "no" },
      AutoRemove: false,
      Init: true,
    },
    NetworkingConfig: {
      EndpointsConfig: { [network]: { Aliases: [input.hostname] } },
    },
  };
  if (input.cmd) spec.Cmd = input.cmd;
  if (input.entrypoint) spec.Entrypoint = input.entrypoint;
  if (input.workingDir) spec.WorkingDir = input.workingDir;
  if (!HOSTNAME_RE.test(input.hostname)) {
    throw new UnsafeSandboxSpecError([`invalid hostname ${input.hostname}`]);
  }
  assertSafeSpec(spec);
  return spec;
}

const ROOT_USERS = new Set(["", "0", "root", "0:0", "root:root"]);
const DOCKER_SOCKET_RE = /docker\.sock|containerd\.sock|podman\.sock|\/var\/run\/?$|^\/run\/?$/;
const SAFE_NETWORK_RE = new RegExp(`^${NETWORK_PREFIX}[a-z0-9_]+$`);

/**
 * Independent re-check of a create spec. Every container SecNess creates passes through this,
 * so a bug in a spec builder (or a later hand-built spec) cannot weaken isolation silently.
 */
export function assertSafeSpec(spec: Docker.ContainerCreateOptions): void {
  const p: string[] = [];
  const hc = spec.HostConfig ?? {};

  const user = (spec.User ?? "").trim();
  if (ROOT_USERS.has(user) || user.startsWith("0:") || user.startsWith("root:")) {
    p.push("container must not run as root");
  }
  if (!hc.CapDrop?.includes("ALL")) p.push("CapDrop must include ALL");
  if (hc.CapAdd && hc.CapAdd.length > 0) p.push("CapAdd must be empty");
  if (hc.Privileged) p.push("Privileged is forbidden");

  const secOpts: string[] = hc.SecurityOpt ?? [];
  if (!secOpts.some((o) => /^no-new-privileges(:true|=true)?$/.test(o))) {
    p.push("no-new-privileges must be set");
  }
  if (secOpts.some((o) => /unconfined/.test(o))) p.push("unconfined seccomp/apparmor is forbidden");

  const net = hc.NetworkMode ?? "";
  if (!SAFE_NETWORK_RE.test(net))
    p.push(`NetworkMode must be a per-run SecNess network, got "${net}"`);
  for (const ns of ["PidMode", "IpcMode", "UTSMode", "UsernsMode", "CgroupnsMode"] as const) {
    const v = (hc as Record<string, unknown>)[ns];
    if (typeof v === "string" && (v === "host" || v.startsWith("container:"))) {
      p.push(`${ns}=${v} is forbidden`);
    }
  }

  if (!(hc.NanoCpus && hc.NanoCpus > 0)) p.push("CPU limit required");
  if (!(hc.Memory && hc.Memory > 0)) p.push("memory limit required");
  if (!(hc.PidsLimit && hc.PidsLimit > 0)) p.push("PIDs limit required");

  for (const bind of hc.Binds ?? []) {
    const parts = bind.split(":");
    const host = parts[0] ?? "";
    const mode = parts.slice(2).join(":");
    if (!mode.split(",").includes("ro")) p.push(`bind ${host} must be read-only`);
    if (DOCKER_SOCKET_RE.test(host)) p.push(`mounting ${host} is forbidden`);
    if (!path.isAbsolute(host) || path.resolve(host) === "/")
      p.push(`bind source ${host} is not allowed`);
  }
  for (const m of hc.Mounts ?? []) {
    if (m.Type !== "tmpfs")
      p.push(`mount type ${m.Type} is forbidden (use Binds for the read-only source)`);
  }
  if (hc.Devices && hc.Devices.length > 0) p.push("device mappings are forbidden");
  if (hc.PortBindings && Object.keys(hc.PortBindings).length > 0)
    p.push("publishing ports to the host is forbidden");
  if (hc.PublishAllPorts) p.push("PublishAllPorts is forbidden");
  if (hc.ExtraHosts && hc.ExtraHosts.length > 0) p.push("ExtraHosts is forbidden");
  if (hc.VolumesFrom && hc.VolumesFrom.length > 0) p.push("VolumesFrom is forbidden");

  const labels = spec.Labels ?? {};
  if (labels[LABELS.managed] !== "true") p.push(`${LABELS.managed} label required`);
  if (!labels[LABELS.run]) p.push(`${LABELS.run} label required`);
  if (!/^\d+$/.test(labels[LABELS.expires] ?? "")) p.push(`${LABELS.expires} label required`);

  if (p.length > 0) throw new UnsafeSandboxSpecError(p);
}
