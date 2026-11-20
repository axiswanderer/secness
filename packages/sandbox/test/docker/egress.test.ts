/**
 * Stage 0 exit criterion: "A sandbox spike proves an app cannot reach the internet
 * (test: curl to an external host fails from inside)." Plus the rest of the 0.3 baseline,
 * verified from inside a running container rather than by reading our own config back.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@secness/schema";
import { SandboxSession } from "../../src/session.js";
import { LABELS } from "../../src/policy.js";
import { docker, ensureImage, NOBODY, probe, skipDocker, TEST_IMAGE } from "./helpers.js";

/** wget exits non-zero on any failure; -T bounds each attempt. */
const fetchCmd = (url: string) => `wget -q -T 5 -O - '${url}'`;

describe.skipIf(skipDocker)("sandbox egress and isolation (needs Docker)", () => {
  let session: SandboxSession;
  let hostServer: http.Server;
  let hostPort: number;
  const runId = newId("run");

  beforeAll(async () => {
    await ensureImage(TEST_IMAGE);
    session = await SandboxSession.create({ runId, limits: { timeoutMs: 10 * 60 * 1000 } });
    // The "app": a static server on the run network.
    await session.start({
      role: "app",
      image: TEST_IMAGE,
      hostname: "srv",
      user: NOBODY,
      cmd: ["sh", "-c", "echo secness-ok > /tmp/index.html && exec httpd -f -p 8080 -h /tmp"],
    });
    // A server on the developer's machine. The sandbox must not reach it.
    hostServer = http.createServer((_req, res) => res.end("host-reached"));
    await new Promise<void>((r) => hostServer.listen(0, "0.0.0.0", r));
    hostPort = (hostServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    hostServer?.close();
    if (session) {
      const report = await session.teardown();
      expect(report.errors).toEqual([]);
      const left = await docker.listContainers({
        all: true,
        filters: { label: [`${LABELS.run}=${runId}`] },
      });
      expect(left).toEqual([]);
    }
  });

  it("positive control: a sibling service on the run network is reachable", async () => {
    const r = await probe(
      session,
      `for i in $(seq 1 15); do ${fetchCmd("http://srv:8080/index.html")} && exit 0; sleep 1; done; exit 1`,
    );
    expect(r.out).toContain("secness-ok");
    expect(r.code).toBe(0);
  });

  it("cannot reach an external host by name", async () => {
    const r = await probe(session, fetchCmd("http://example.com/"));
    expect(r.code).not.toBe(0);
  });

  it("cannot reach an external host by IP (no DNS needed)", async () => {
    const r = await probe(session, fetchCmd("http://1.1.1.1/"));
    expect(r.code).not.toBe(0);
  });

  it("cannot reach the cloud metadata endpoint", async () => {
    const r = await probe(session, fetchCmd("http://169.254.169.254/latest/meta-data/"));
    expect(r.code).not.toBe(0);
  });

  it("cannot reach a server on the developer's machine", async () => {
    const targets = [
      `http://host.docker.internal:${hostPort}/`,
      `http://172.17.0.1:${hostPort}/`,
      `http://gateway.docker.internal:${hostPort}/`,
    ];
    for (const t of targets) {
      const r = await probe(session, fetchCmd(t));
      expect(r.out, t).not.toContain("host-reached");
      expect(r.code, t).not.toBe(0);
    }
  });

  it("has no default route out of the network", async () => {
    const r = await probe(session, "ip route");
    expect(r.out).not.toMatch(/^default /m);
  });

  it("runs hardened: non-root, no capabilities, no-new-privs, seccomp, read-only root, no docker socket", async () => {
    const r = await probe(
      session,
      [
        "echo uid=$(id -u)",
        "grep -E '^(CapEff|NoNewPrivs|Seccomp):' /proc/self/status",
        "touch /etc/secness-probe 2>/dev/null && echo rootfs=writable || echo rootfs=readonly",
        "touch /tmp/ok && echo tmp=writable",
        "test -e /var/run/docker.sock && echo socket=present || echo socket=absent",
      ].join("; "),
    );
    expect(r.out).toContain("uid=65534");
    expect(r.out).toMatch(/CapEff:\s+0000000000000000/);
    expect(r.out).toMatch(/NoNewPrivs:\s+1/);
    expect(r.out).toMatch(/Seccomp:\s+2/); // 2 = filter mode (Docker's default profile)
    expect(r.out).toContain("rootfs=readonly");
    expect(r.out).toContain("tmp=writable");
    expect(r.out).toContain("socket=absent");
  });

  it("applies resource limits on the running container", async () => {
    const containers = await docker.listContainers({
      filters: { label: [`${LABELS.run}=${runId}`, `${LABELS.role}=app`] },
    });
    expect(containers).toHaveLength(1);
    const info = await docker.getContainer(containers[0]!.Id).inspect();
    expect(info.HostConfig.NanoCpus).toBe(2e9);
    expect(info.HostConfig.Memory).toBe(2 * 1024 ** 3);
    expect(info.HostConfig.PidsLimit).toBe(512);
    expect(info.HostConfig.Binds ?? []).toEqual([]);
  });

  it("the run network is internal", async () => {
    const net = await session.network.inspect();
    expect(net.Internal).toBe(true);
  });
});
