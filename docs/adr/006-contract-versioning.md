# ADR-006: Contracts are versioned JSON Schemas; v1 is frozen; tolerant readers

- Status: accepted
- Date: 2026-11-17

## Context

The six section 3 types (plus Verdict) are the spine every component speaks. Changing them
silently would break adapters, stored data and other people's integrations.

## Decision

- JSON Schema 2020-12 in `packages/schema/schemas/v1`, with TypeScript types generated from them.
- v1 is frozen: `schemas/frozen/v1` is the snapshot, and `pnpm schema:check` in CI fails on any
  change that is not backward-compatible. Allowed: new optional properties, new `$defs`, new schema
  files, annotation edits. Anything else needs `schemas/v2` and a major version bump.
- Runtime validation is a tolerant reader (unknown properties accepted), so additive changes
  never break older consumers. Generated TS types are closed, so typos fail at compile time.

## Consequences

Enum values cannot be added within v1. Fields that will clearly grow (for example finding
classes) are strings with examples rather than enums.
