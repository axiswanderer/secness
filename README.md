# SecNess

Your AI builds it, SecNess breaks it, your AI fixes it, SecNess proves the fix.

The full design is in [docs/SecNess — Architecture & Staged Build Plan.pdf](docs/). Decisions are
recorded in [docs/adr](docs/adr).

## Status: Stage 0 (Foundations)

| Stage 0 exit criterion                                         | Status                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Monorepo builds, tests and lints in CI in under 10 minutes     | CI in place (`.github/workflows/ci.yml`, 10-minute timeout)          |
| JSON Schemas for all section 3 types frozen at v1              | Done: `packages/schema`, enforced by `pnpm schema:check`             |
| SecNess Bench: at least 10 apps and 60 planted vulnerabilities | 1 app, 13 vulnerabilities; plan for the other 9 in `bench/README.md` |
| Sandbox spike proves an app cannot reach the internet          | Suite written (`pnpm test:sandbox-escape`); runs in CI on Docker     |
| Reaper removes orphaned containers in a forced-crash test      | Suite written, same command                                          |
| ADRs 001 to 005 merged                                         | Written (plus 006 on contract versioning)                            |

## Layout

```
apps/cli, apps/daemon, apps/mcp-server     # Stage 1
packages/schema        # section 3 contracts: JSON Schemas (frozen v1) + generated types
packages/core          # Run state machine (store and queue arrive in Stage 1)
packages/sandbox       # isolation baseline, run networks, reaper
packages/llm           # LlmClient: Anthropic and OpenAI drivers, metering, spend cap
packages/{adapters,change-intel,profiler,engines/*,validation,remediation}   # Stage 1+
rules/                 # SecNess Semgrep rules and Nuclei templates (Stage 1)
bench/                 # SecNess Bench
```

## Development

Requires Node.js 22+ and pnpm (`corepack enable pnpm`). The sandbox suite needs Docker.

```sh
pnpm install
pnpm build && pnpm typecheck && pnpm test && pnpm lint
pnpm schema:check            # v1 contract compatibility
pnpm test:sandbox-escape     # egress, isolation and forced-crash reaper tests (Docker)
pnpm bench:validate          # bench ground truth and Stage 0 coverage
```

Commits follow Conventional Commits; versioning uses changesets (`pnpm changeset`).
