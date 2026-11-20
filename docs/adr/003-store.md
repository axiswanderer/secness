# ADR-003: SQLite + Drizzle locally, PostgreSQL in the cloud, one schema

- Status: accepted
- Date: 2026-11-17

## Context

Stages 1 to 3 run entirely on the developer's machine. Stage 4 moves the same components to a
cloud control plane.

## Decision

- One findings store under C3 to C10: SQLite at `.secness/state.db` locally, PostgreSQL from
  Stage 4, both through Drizzle ORM with the same schema.
- Evidence blobs (HTTP traffic, logs, replay scripts) on the local file system under
  `.secness/evidence/`, S3-compatible storage in the cloud.
- Stored rows are the section 3 contracts (`@secness/schema`), validated on write.

## Consequences

No server to install locally. SQL features are limited to what both engines support.
