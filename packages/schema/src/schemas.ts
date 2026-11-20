import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 1 as const;
export const SCHEMA_BASE_URI = "https://schemas.secness.dev/v1/" as const;

/** schemas/ ships next to dist/ and src/, so this resolves from either. */
export const SCHEMA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
  "v1",
);

export type ContractName =
  "ChangeEvent" | "TargetProfile" | "TestPlan" | "Finding" | "Run" | "GateResult" | "Verdict";

export const CONTRACT_FILES: Record<ContractName, string> = {
  ChangeEvent: "change-event.schema.json",
  TargetProfile: "target-profile.schema.json",
  TestPlan: "test-plan.schema.json",
  Finding: "finding.schema.json",
  Run: "run.schema.json",
  GateResult: "gate-result.schema.json",
  Verdict: "verdict.schema.json",
};

let cache: Record<string, Record<string, unknown>> | undefined;

/** All v1 schema documents keyed by file name. */
export function loadSchemas(): Record<string, Record<string, unknown>> {
  if (!cache) {
    cache = {};
    for (const f of readdirSync(SCHEMA_DIR).filter((n) => n.endsWith(".schema.json"))) {
      cache[f] = JSON.parse(readFileSync(path.join(SCHEMA_DIR, f), "utf8")) as Record<
        string,
        unknown
      >;
    }
  }
  return cache;
}
