/**
 * Sandbox security baseline (Stage 0, section 0.3). These are the defaults every
 * container and network SecNess creates must meet. Changing anything here requires
 * the egress/escape suite (`pnpm test:sandbox-escape`) to pass.
 */

export const LABELS = {
  /** Marks a resource as SecNess-owned. The reaper only ever touches resources with this label. */
  managed: "secness.managed",
  /** Run id the resource belongs to. */
  run: "secness.run",
  /** Unix epoch milliseconds after which the reaper deletes the resource. */
  expires: "secness.expires",
  /** app | db | scanner | probe */
  role: "secness.role",
} as const;

export type ContainerRole = "app" | "db" | "scanner" | "probe";

export interface ResourceLimits {
  /** CPU cores. */
  cpus: number;
  memoryBytes: number;
  pids: number;
  /** Wall-clock budget for the whole run; becomes the reaper expiry. */
  timeoutMs: number;
}

export const DEFAULT_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  cpus: 2,
  memoryBytes: 2 * 1024 ** 3,
  pids: 512,
  timeoutMs: 15 * 60 * 1000,
});

/** Hard ceilings. Configuration may lower limits, or raise them up to these, never beyond. */
export const MAX_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  cpus: 8,
  memoryBytes: 8 * 1024 ** 3,
  pids: 4096,
  timeoutMs: 60 * 60 * 1000,
});

/** Non-root uid:gid used when the caller does not choose one. Numeric so it works in any image. */
export const DEFAULT_USER = "10001:10001";

/** Paths never copied into a sandbox snapshot (section 1.4). Real .env values never enter the sandbox. */
export const SNAPSHOT_EXCLUDES: readonly string[] = Object.freeze([
  "node_modules",
  ".git",
  ".env",
  ".env.*",
  "*.env",
  ".secness",
  ".npmrc",
  ".aws",
  ".ssh",
]);

export const NETWORK_PREFIX = "secness-run-";

export function networkNameFor(runId: string): string {
  return NETWORK_PREFIX + runId.toLowerCase();
}

export function resolveLimits(overrides: Partial<ResourceLimits> = {}): ResourceLimits {
  const out = { ...DEFAULT_LIMITS, ...overrides };
  for (const key of Object.keys(out) as (keyof ResourceLimits)[]) {
    const v = out[key];
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`sandbox limit ${key} must be > 0`);
    if (v > MAX_LIMITS[key]) {
      throw new RangeError(`sandbox limit ${key}=${v} exceeds the maximum ${MAX_LIMITS[key]}`);
    }
  }
  return out;
}
