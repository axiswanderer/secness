import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Finding } from "@secness/schema";
import { listAppDirs, loadApp } from "../src/load.js";
import { normalizeEndpoint, regressions, scoreApp, totals } from "../src/score.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "fixtures", "apps", "99-fixture");
const RUN = "run_01HZY3Q8K2M4N6P8R0T2V4X6Z8";
let n = 0;

function finding(over: {
  cwe: string;
  file?: string;
  line?: number | null;
  endpoint?: string | null;
  confidence?: Finding["confidence"];
}): Finding {
  return {
    id: `fnd_01HZY3Q8K2M4N6P8R0T2V4X6${String(n++).padStart(2, "0")}`,
    fingerprint: "sha256:" + "0".repeat(64),
    status: "confirmed",
    title: `finding ${over.cwe}`,
    class: { cwe: over.cwe },
    severity: { level: "high", rationale: "x" },
    confidence: over.confidence ?? "proven",
    location: {
      file: over.file ?? "src/app.ts",
      line_start: over.line ?? null,
      endpoint: over.endpoint ?? null,
    },
    evidence: {},
    reproduction: [],
    remediation: { summary: "x" },
    detected_by: ["test"],
    first_seen_run: RUN,
    last_seen_run: RUN,
  };
}

describe("expected.yaml loading", () => {
  it("loads the fixture with no errors", () => {
    const r = loadApp(fixtureDir);
    expect(r.errors).toEqual([]);
    expect(r.app?.vulnerabilities).toHaveLength(2);
  });

  it("every real bench app validates against its source", () => {
    for (const dir of listAppDirs()) expect(loadApp(dir).errors, dir).toEqual([]);
  });
});

describe("scoring", () => {
  const app = loadApp(fixtureDir).app!;

  it("matches by endpoint, by file+line within tolerance, and requires a compatible CWE", () => {
    const s = scoreApp(app, [
      finding({ cwe: "CWE-89", line: 8 }), // within 5 lines of V01
      finding({ cwe: "CWE-284", endpoint: "GET /api/notes/{noteId}" }), // V02 via endpoint
      finding({ cwe: "CWE-79", line: 4 }), // wrong class: false positive
    ]);
    expect(s.found).toEqual(["V01", "V02"]);
    expect(s.falsePositives).toBe(1);
    expect(s.byConfidence.proven).toEqual({ total: 3, real: 2 });
  });

  it("counts a second finding for the same vuln as a duplicate, not a false positive", () => {
    const s = scoreApp(app, [
      finding({ cwe: "CWE-89", line: 4, confidence: "unverified" }),
      finding({ cwe: "CWE-89", endpoint: "GET /api/notes/:id" }),
    ]);
    expect(s).toMatchObject({ found: ["V01"], truePositives: 1, duplicates: 1, falsePositives: 0 });
    // The proven finding claims the vuln; the unverified one is the duplicate.
    expect(s.byConfidence.proven).toEqual({ total: 1, real: 1 });
  });

  it("does not match far-away lines", () => {
    expect(scoreApp(app, [finding({ cwe: "CWE-89", line: 40 })]).found).toEqual([]);
  });

  it("computes totals and flags drops over 3 points", () => {
    const t = totals([app], [scoreApp(app, [finding({ cwe: "CWE-89", line: 4 })])]);
    expect(t.recall).toBe(0.5);
    expect(t.precisionProven).toBe(1);
    expect(regressions({ ...t, recall: 0.54 }, t)).toHaveLength(1);
    expect(regressions({ ...t, recall: 0.52 }, t)).toHaveLength(0);
  });

  it("normalizes endpoint parameter styles", () => {
    expect(normalizeEndpoint("get /a/{id}/")).toBe(normalizeEndpoint("GET /a/:userId"));
  });
});
