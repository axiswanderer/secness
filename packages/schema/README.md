# @secness/schema

The section 3 contracts as JSON Schema 2020-12 (`schemas/v1`), generated TypeScript types
(`src/generated/types.ts`), validators, and ULID-based ids. See ADR-006.

```ts
import { assertValid, newId, type Finding } from "@secness/schema";
const finding = assertValid("Finding", json); // throws ContractValidationError
```

- `pnpm gen`: regenerate types after editing schemas.
- `pnpm check`: fail if `schemas/v1` is not backward-compatible with `schemas/frozen/v1`.
- v1 is frozen. Allowed: new optional properties, new `$defs`, new schema files, annotation edits.
  Anything else needs `schemas/v2` and a major version bump.
