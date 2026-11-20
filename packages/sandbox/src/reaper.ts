import type Docker from "dockerode";
import { LABELS, MAX_LIMITS } from "./policy.js";

export interface ReapReport {
  containers: string[];
  networks: string[];
  errors: string[];
}

interface Labelled {
  Labels?: Record<string, string> | null;
  Created?: number | string;
}

/**
 * When does a resource expire? Uses its secness.expires label. A missing or unparsable
 * label falls back to creation time + the maximum allowed timeout, so nothing lives forever.
 */
export function expiryOf(r: Labelled): number {
  const label = r.Labels?.[LABELS.expires];
  if (label && /^\d+$/.test(label)) return Number(label);
  const created =
    typeof r.Created === "number" ? r.Created * 1000 : Date.parse(String(r.Created ?? ""));
  return (Number.isFinite(created) ? created : 0) + MAX_LIMITS.timeoutMs;
}

/**
 * Deletes every SecNess-managed container and network whose expiry has passed.
 * Only resources labelled secness.managed=true are ever considered.
 */
export async function reap(
  docker: Docker,
  opts: { now?: number; runId?: string; force?: boolean } = {},
): Promise<ReapReport> {
  const now = opts.now ?? Date.now();
  const labelFilter = [`${LABELS.managed}=true`];
  if (opts.runId) labelFilter.push(`${LABELS.run}=${opts.runId}`);
  const report: ReapReport = { containers: [], networks: [], errors: [] };
  const due = (r: Labelled) => opts.force === true || expiryOf(r) <= now;

  const containers = await docker.listContainers({ all: true, filters: { label: labelFilter } });
  for (const c of containers) {
    if (!due(c)) continue;
    try {
      await docker.getContainer(c.Id).remove({ force: true, v: true });
      report.containers.push(c.Id);
    } catch (e) {
      if (!isNotFound(e)) report.errors.push(`container ${c.Id}: ${String(e)}`);
    }
  }

  // Networks after containers: a network with attached endpoints cannot be removed.
  const networks = await docker.listNetworks({ filters: { label: labelFilter } });
  for (const n of networks) {
    if (!due(n)) continue;
    try {
      await docker.getNetwork(n.Id).remove();
      report.networks.push(n.Id);
    } catch (e) {
      if (!isNotFound(e)) report.errors.push(`network ${n.Id}: ${String(e)}`);
    }
  }
  return report;
}

function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { statusCode?: number }).statusCode === 404;
}

/** Runs reap() on an interval until the returned stop function is called. */
export function startReaper(
  docker: Docker,
  opts: { intervalMs?: number; onReport?: (r: ReapReport) => void } = {},
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await reap(docker);
      opts.onReport?.(r);
    } catch (e) {
      opts.onReport?.({ containers: [], networks: [], errors: [String(e)] });
    }
    if (!stopped) timer = setTimeout(tick, opts.intervalMs ?? 30_000);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
