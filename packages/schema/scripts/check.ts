/**
 * Schema compatibility gate (run in CI). Fails if schemas/v1 is not backward-compatible
 * with the frozen snapshot in schemas/frozen/v1. A breaking change needs schemas/v2
 * and a major version bump of @secness/schema, not an edit to v1.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCompat } from "../src/compat.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(dir: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".schema.json"))) {
    out[f] = JSON.parse(await readFile(path.join(dir, f), "utf8"));
  }
  return out;
}

const frozen = await load(path.join(root, "schemas", "frozen", "v1"));
const current = await load(path.join(root, "schemas", "v1"));
if (Object.keys(frozen).length === 0) {
  console.error(
    "No frozen snapshot found in schemas/frozen/v1. Run `pnpm --filter @secness/schema freeze`.",
  );
  process.exit(1);
}
const issues = checkCompat(frozen, current);
if (issues.length > 0) {
  console.error(`Breaking schema changes vs frozen v1 (${issues.length}):`);
  for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
  console.error("Revert the change, or introduce schemas/v2 with a major version bump.");
  process.exit(1);
}
console.log(
  `schemas/v1 is compatible with the frozen snapshot (${Object.keys(frozen).length} files).`,
);
