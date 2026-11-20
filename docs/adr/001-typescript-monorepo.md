# ADR-001: TypeScript on Node.js 22 in a pnpm + Turborepo monorepo

- Status: accepted
- Date: 2026-11-17

## Context

SecNess ships as `npm install -g secness`, exposes an MCP server, and calls LLM SDKs. All of
those are first-class in the Node.js ecosystem. One small team builds every component.

## Decision

- Core language: TypeScript (strict, ESM, NodeNext resolution) on Node.js 22 or later.
- pnpm workspaces plus Turborepo. Layout as in plan section 0.1.
- TypeScript is pinned to 6.0.x. TypeScript 7 (the native compiler) is out, but typescript-eslint
  does not support it yet, and Stage 1 route extraction depends on the TypeScript compiler JS API.
  Revisit when both are available on 7.
- Go is added only where profiling shows a measured need.
- Supply chain: `minimumReleaseAge` of 14 days, and dependency install scripts are denied unless
  allowlisted in `pnpm-workspace.yaml`.

## Consequences

One language and toolchain until a measured need. Packages expose only the section 3 contracts
to each other, so a component can later move to another language behind the same interface.
