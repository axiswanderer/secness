# SecNess: notes for coding agents

Read `README.md` first. The full plan is the PDF in `docs/`; decisions are in `docs/adr/`.

Rules that settle arguments (plan section 1):

- Components talk only through the contracts in `@secness/schema`. Never edit
  `packages/schema/schemas/v1` in a breaking way: `pnpm schema:check` must pass. After editing
  schemas run `pnpm schema:gen` and commit the generated types.
- Every sandbox container goes through `buildContainerSpec` / `SandboxSession`; never call
  `docker.createContainer` with a hand-built spec. Never weaken `assertSafeSpec`.
  Run `pnpm test:sandbox-escape` (needs Docker) after touching `packages/sandbox`.
- Only `packages/llm` drivers import provider SDKs. All LLM calls go through `LlmClient`.
- The engine core never imports anything harness-specific (Claude Code, Codex, Cursor).
- Bench apps under `bench/apps/*/source` are intentionally vulnerable. Do not "fix" them, and
  never add comments or names that hint at planted bugs. Keep `expected.yaml` lines exact
  (`pnpm bench:validate`).
- TypeScript is pinned to 6.0.x (see ADR-001). ESM with NodeNext: relative imports end in `.js`.
- Don't add dependencies published less than 14 days ago; install scripts are denied by default.

Checks before finishing: `pnpm build && pnpm typecheck && pnpm test && pnpm lint`.
