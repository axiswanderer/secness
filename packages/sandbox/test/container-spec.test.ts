import { describe, expect, it } from "vitest";
import type Docker from "dockerode";
import {
  assertSafeSpec,
  buildContainerSpec,
  UnsafeSandboxSpecError,
} from "../src/container-spec.js";
import { DEFAULT_LIMITS, LABELS, MAX_LIMITS, resolveLimits } from "../src/policy.js";

const RUN = "run_01HZY3Q8K2M4N6P8R0T2V4X6Z8";
const base = { runId: RUN, role: "app" as const, image: "node:22-alpine", hostname: "api" };

function mutated(fn: (s: Docker.ContainerCreateOptions) => void): Docker.ContainerCreateOptions {
  const s = structuredClone(buildContainerSpec(base));
  fn(s);
  return s;
}

describe("buildContainerSpec defaults", () => {
  const spec = buildContainerSpec(base, 1_000);
  const hc = spec.HostConfig!;

  it("runs as non-root with every capability dropped", () => {
    expect(spec.User).toBe("10001:10001");
    expect(hc.CapDrop).toEqual(["ALL"]);
    expect(hc.CapAdd).toEqual([]);
    expect(hc.Privileged).toBe(false);
  });

  it("sets no-new-privileges and keeps the default seccomp profile", () => {
    expect(hc.SecurityOpt).toEqual(["no-new-privileges:true"]);
  });

  it("uses a read-only root FS with a noexec tmpfs", () => {
    expect(hc.ReadonlyRootfs).toBe(true);
    expect(hc.Tmpfs?.["/tmp"]).toContain("noexec");
  });

  it("applies the section 0.3 resource limits", () => {
    expect(hc.NanoCpus).toBe(2e9);
    expect(hc.Memory).toBe(2 * 1024 ** 3);
    expect(hc.MemorySwap).toBe(hc.Memory);
    expect(hc.PidsLimit).toBe(512);
    expect(spec.Labels?.[LABELS.expires]).toBe(String(1_000 + DEFAULT_LIMITS.timeoutMs));
  });

  it("attaches only to the run's own network and publishes nothing", () => {
    expect(hc.NetworkMode).toBe(`secness-run-${RUN.toLowerCase()}`);
    expect(hc.PortBindings).toEqual({});
    expect(hc.Binds).toEqual([]);
  });

  it("mounts the source snapshot read-only", () => {
    const s = buildContainerSpec({
      ...base,
      source: { hostPath: "/tmp/snap", containerPath: "/app" },
    });
    expect(s.HostConfig?.Binds).toEqual(["/tmp/snap:/app:ro"]);
  });
});

describe("assertSafeSpec refuses weakened specs", () => {
  it.each<[string, (s: Docker.ContainerCreateOptions) => void]>([
    ["root user", (s) => (s.User = "root")],
    ["uid 0", (s) => (s.User = "0:1000")],
    ["empty user (image default may be root)", (s) => (s.User = "")],
    ["capabilities kept", (s) => (s.HostConfig!.CapDrop = [])],
    ["capability added", (s) => (s.HostConfig!.CapAdd = ["NET_RAW"])],
    ["privileged", (s) => (s.HostConfig!.Privileged = true)],
    ["no-new-privileges missing", (s) => (s.HostConfig!.SecurityOpt = [])],
    ["seccomp unconfined", (s) => s.HostConfig!.SecurityOpt!.push("seccomp=unconfined")],
    ["host network", (s) => (s.HostConfig!.NetworkMode = "host")],
    ["default bridge (has egress)", (s) => (s.HostConfig!.NetworkMode = "bridge")],
    ["host pid namespace", (s) => ((s.HostConfig as Record<string, unknown>).PidMode = "host")],
    [
      "docker socket mount",
      (s) => (s.HostConfig!.Binds = ["/var/run/docker.sock:/var/run/docker.sock:ro"]),
    ],
    ["writable bind", (s) => (s.HostConfig!.Binds = ["/tmp/snap:/app:rw"])],
    ["bind without mode", (s) => (s.HostConfig!.Binds = ["/tmp/snap:/app"])],
    ["host root bind", (s) => (s.HostConfig!.Binds = ["/:/host:ro"])],
    [
      "bind mount via Mounts",
      (s) => (s.HostConfig!.Mounts = [{ Type: "bind", Source: "/", Target: "/h" }]),
    ],
    [
      "published port",
      (s) => (s.HostConfig!.PortBindings = { "3000/tcp": [{ HostPort: "3000" }] }),
    ],
    [
      "device mapping",
      (s) =>
        (s.HostConfig!.Devices = [
          { PathOnHost: "/dev/kvm", PathInContainer: "/dev/kvm", CgroupPermissions: "rwm" },
        ]),
    ],
    ["no memory limit", (s) => (s.HostConfig!.Memory = 0)],
    ["no pids limit", (s) => (s.HostConfig!.PidsLimit = 0)],
    ["extra hosts", (s) => (s.HostConfig!.ExtraHosts = ["host.docker.internal:host-gateway"])],
    ["missing run label", (s) => delete s.Labels![LABELS.run]],
    ["missing expiry label", (s) => delete s.Labels![LABELS.expires]],
  ])("%s", (_name, mutate) => {
    expect(() => assertSafeSpec(mutated(mutate))).toThrow(UnsafeSandboxSpecError);
  });

  it("refuses root from the builder too", () => {
    expect(() => buildContainerSpec({ ...base, user: "0" })).toThrow(UnsafeSandboxSpecError);
  });

  it("refuses hostnames that could smuggle DNS tricks", () => {
    expect(() => buildContainerSpec({ ...base, hostname: "evil.com" })).toThrow(
      UnsafeSandboxSpecError,
    );
  });
});

describe("resolveLimits", () => {
  it("allows lowering and refuses exceeding the ceiling", () => {
    expect(resolveLimits({ cpus: 1 }).cpus).toBe(1);
    expect(() => resolveLimits({ memoryBytes: MAX_LIMITS.memoryBytes + 1 })).toThrow(RangeError);
    expect(() => resolveLimits({ pids: 0 })).toThrow(RangeError);
  });
});
