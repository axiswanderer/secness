import type { Confidence, Finding } from "@secness/schema";
import { VULN_CLASSES } from "./classes.js";
import type { BenchApp, ExpectedVuln, KnownExtra } from "./load.js";

/** How far (in lines) a finding may sit outside a planted range and still match. */
export const LINE_TOLERANCE = 5;

export interface AppScore {
  app: string;
  expected: number;
  found: string[];
  missed: string[];
  /** Findings by outcome. Duplicates match an already-found vuln: real, but not new recall. */
  truePositives: number;
  duplicates: number;
  falsePositives: number;
  byConfidence: Record<Confidence, { total: number; real: number }>;
  falsePositiveTitles: string[];
}

/** "GET /api/users/:userId" and "GET /api/users/{id}" are the same endpoint. */
export function normalizeEndpoint(e: string | null | undefined): string | null {
  if (!e) return null;
  return e
    .trim()
    .replace(/\{[^}]+\}|:[A-Za-z0-9_]+/g, ":p")
    .replace(/\/+$/, "")
    .toUpperCase();
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/");
}

export function matchesVuln(f: Finding, v: ExpectedVuln): boolean {
  if (!(VULN_CLASSES[v.class].cwes as readonly string[]).includes(f.class.cwe)) return false;
  const fe = normalizeEndpoint(f.location.endpoint);
  const ve = normalizeEndpoint(v.endpoint);
  if (fe && ve && fe === ve) return true;
  if (normalizePath(f.location.file) !== normalizePath(v.file)) return false;
  // Dependency findings point at a manifest or lockfile, not a line.
  if (v.class === "vulnerable-dependency") return true;
  const start = f.location.line_start;
  if (start == null) return false;
  const end = f.location.line_end ?? start;
  return start <= v.lines[1] + LINE_TOLERANCE && end >= v.lines[0] - LINE_TOLERANCE;
}

function matchesExtra(f: Finding, x: KnownExtra): boolean {
  if (f.class.cwe !== x.cwe) return false;
  const fe = normalizeEndpoint(f.location.endpoint);
  const xe = normalizeEndpoint(x.endpoint);
  if (fe && xe) return fe === xe;
  return normalizePath(f.location.file) === normalizePath(x.file);
}

export function scoreApp(app: BenchApp, findings: Finding[]): AppScore {
  const found = new Set<string>();
  const byConfidence: AppScore["byConfidence"] = {
    proven: { total: 0, real: 0 },
    likely: { total: 0, real: 0 },
    unverified: { total: 0, real: 0 },
  };
  let truePositives = 0;
  let duplicates = 0;
  const falsePositiveTitles: string[] = [];

  // Stronger evidence first, so a proven finding claims the vuln before an unverified one.
  const rank: Record<Confidence, number> = { proven: 0, likely: 1, unverified: 2 };
  const ordered = [...findings].sort((a, b) => rank[a.confidence] - rank[b.confidence]);

  for (const f of ordered) {
    byConfidence[f.confidence].total++;
    const vuln = app.vulnerabilities.find((v) => !found.has(v.id) && matchesVuln(f, v));
    if (vuln) {
      found.add(vuln.id);
      truePositives++;
      byConfidence[f.confidence].real++;
    } else if (
      app.vulnerabilities.some((v) => found.has(v.id) && matchesVuln(f, v)) ||
      app.known_extras.some((x) => matchesExtra(f, x))
    ) {
      duplicates++;
      byConfidence[f.confidence].real++;
    } else {
      falsePositiveTitles.push(`[${f.confidence}] ${f.title} (${f.class.cwe} ${f.location.file})`);
    }
  }

  return {
    app: app.id,
    expected: app.vulnerabilities.length,
    found: [...found].sort(),
    missed: app.vulnerabilities.map((v) => v.id).filter((id) => !found.has(id)),
    truePositives,
    duplicates,
    falsePositives: falsePositiveTitles.length,
    byConfidence,
    falsePositiveTitles,
  };
}

export interface BenchTotals {
  recall: number;
  precisionProven: number | null;
  precisionAll: number | null;
  expected: number;
  found: number;
  recallByClass: Record<string, { expected: number; found: number }>;
}

export function totals(apps: BenchApp[], scores: AppScore[]): BenchTotals {
  const expected = scores.reduce((n, s) => n + s.expected, 0);
  const found = scores.reduce((n, s) => n + s.found.length, 0);
  const sum = (pick: (s: AppScore) => { total: number; real: number }) =>
    scores.reduce(
      (acc, s) => ({ total: acc.total + pick(s).total, real: acc.real + pick(s).real }),
      { total: 0, real: 0 },
    );
  const proven = sum((s) => s.byConfidence.proven);
  const all = scores.reduce(
    (acc, s) => {
      for (const c of Object.values(s.byConfidence)) {
        acc.total += c.total;
        acc.real += c.real;
      }
      return acc;
    },
    { total: 0, real: 0 },
  );
  const recallByClass: BenchTotals["recallByClass"] = {};
  for (const app of apps) {
    const s = scores.find((x) => x.app === app.id);
    for (const v of app.vulnerabilities) {
      const r = (recallByClass[v.class] ??= { expected: 0, found: 0 });
      r.expected++;
      if (s?.found.includes(v.id)) r.found++;
    }
  }
  return {
    recall: expected === 0 ? 0 : found / expected,
    precisionProven: proven.total === 0 ? null : proven.real / proven.total,
    precisionAll: all.total === 0 ? null : all.real / all.total,
    expected,
    found,
    recallByClass,
  };
}

/** Cross-cutting rule: a drop of more than 3 points in recall or precision fails the build. */
export const MAX_DROP_POINTS = 3;

export function regressions(baseline: BenchTotals, current: BenchTotals): string[] {
  const out: string[] = [];
  const check = (name: string, b: number | null, c: number | null) => {
    if (b === null || c === null) return;
    const drop = (b - c) * 100;
    if (drop > MAX_DROP_POINTS)
      out.push(
        `${name} dropped ${drop.toFixed(1)} points (${(b * 100).toFixed(1)}% -> ${(c * 100).toFixed(1)}%)`,
      );
  };
  check("recall", baseline.recall, current.recall);
  check("precision (proven)", baseline.precisionProven, current.precisionProven);
  return out;
}
