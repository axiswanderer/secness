# ADR-002: Docker Engine API for sandboxes, hardened by default; microVMs from Stage 4

- Status: accepted
- Date: 2026-11-17

## Context

The sandbox runs untrusted, AI-written code and attack tools. Developers already have Docker.
Namespaces alone are not enough isolation for a multi-tenant cloud.

## Decision

- Stages 1 to 3: Docker Engine API via `dockerode` (Podman-compatible socket).
- Every container is built by `buildContainerSpec` and re-checked by `assertSafeSpec`: non-root,
  `CapDrop=ALL`, no-new-privileges, default seccomp, read-only root FS, CPU 2 / 2 GB / 512 PIDs,
  only the read-only source snapshot mounted, no published ports, never the Docker socket.
- Each run gets its own `Internal: true` network: no route out. Scanners attach only to it, and
  target an allowlist of the run's own service hostnames, enforced in code.
- Sandbox env values are generated fakes. Host values are refused (`assertNoHostSecrets`).
- Every resource is labelled `secness.managed`, `secness.run` and `secness.expires`. A reaper
  deletes anything past expiry, so a crash cannot leak containers.
- Stage 4+: Firecracker microVMs or gVisor on dedicated nodes, one run per VM.

## Consequences

The egress and escape suite (`pnpm test:sandbox-escape`) must pass on every change to
`packages/sandbox`. Apps that need a writable root FS must opt out explicitly, per container.
