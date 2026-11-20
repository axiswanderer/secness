# ADR-004: Orchestrate proven scanners; our value is selection, validation and verification

- Status: accepted
- Date: 2026-11-17

## Context

Mature open-source engines exist for SAST, secrets, dependencies, IaC and DAST. Building our own
would take years and still trail them.

## Decision

- Static: Semgrep (community + SecNess rules in `rules/`), Gitleaks, OSV-Scanner or Trivy, Trivy config.
- Dynamic: OWASP ZAP (API scan), Nuclei (curated templates), Schemathesis, plus SecNess's own
  TypeScript suites for access control, auth and input handling, which are the core of Stage 1.
- All scanners run as containers on the run's internal network, wrapped in
  `packages/engines/*`, and emit raw findings that only C9 can promote.

## Consequences

Our work goes into change-aware test selection, proof-based validation (oracles), agent-ready
feedback and fix verification. Scanner versions are pinned and upgraded deliberately, measured
on SecNess Bench.
