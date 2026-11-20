import { describe, expect, it } from "vitest";
import type Docker from "dockerode";
import { expiryOf, reap } from "../src/reaper.js";
import { LABELS, MAX_LIMITS } from "../src/policy.js";

interface Res {
  Id: string;
  Labels: Record<string, string>;
  Created?: number;
}

/** Minimal fake of the dockerode surface reap() uses. Records removal order. */
function fakeDocker(containers: Res[], networks: Res[]) {
  const removed: string[] = [];
  const match = (r: Res, filters?: { label?: string[] }) =>
    (filters?.label ?? []).every((f) => {
      const [k, v] = f.split("=");
      return r.Labels[k!] === v;
    });
  const docker = {
    listContainers: async (o: { filters?: { label?: string[] } }) =>
      containers.filter((c) => match(c, o.filters)),
    listNetworks: async (o: { filters?: { label?: string[] } }) =>
      networks.filter((n) => match(n, o.filters)),
    getContainer: (id: string) => ({ remove: async () => void removed.push(`c:${id}`) }),
    getNetwork: (id: string) => ({ remove: async () => void removed.push(`n:${id}`) }),
  };
  return { docker: docker as unknown as Docker, removed };
}

const managed = (id: string, expires: number, run = "run_A"): Res => ({
  Id: id,
  Labels: { [LABELS.managed]: "true", [LABELS.run]: run, [LABELS.expires]: String(expires) },
});

describe("reaper", () => {
  it("removes only expired, SecNess-managed resources, containers before networks", async () => {
    const { docker, removed } = fakeDocker(
      [
        managed("old", 100),
        managed("fresh", 10_000),
        { Id: "users-own", Labels: { [LABELS.expires]: "1" } },
      ],
      [managed("oldnet", 100), managed("freshnet", 10_000)],
    );
    const r = await reap(docker, { now: 5_000 });
    expect(removed).toEqual(["c:old", "n:oldnet"]);
    expect(r.errors).toEqual([]);
  });

  it("force-removes a single run regardless of expiry (teardown)", async () => {
    const { docker, removed } = fakeDocker(
      [managed("a", 10_000, "run_A"), managed("b", 10_000, "run_B")],
      [],
    );
    await reap(docker, { now: 0, runId: "run_A", force: true });
    expect(removed).toEqual(["c:a"]);
  });

  it("treats a missing expiry label as created + max timeout", () => {
    expect(expiryOf({ Labels: {}, Created: 1_000 })).toBe(1_000_000 + MAX_LIMITS.timeoutMs);
    expect(expiryOf({ Labels: { [LABELS.expires]: "abc" }, Created: 0 })).toBe(
      MAX_LIMITS.timeoutMs,
    );
  });
});
