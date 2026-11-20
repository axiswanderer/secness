/**
 * SecNess Bench.
 *
 *   tsx run.ts validate [--strict]
 *       Check every apps/<id>/expected.yaml against its source; report Stage 0 coverage.
 *   tsx run.ts run --scanner "<cmd with {repo}>" [--apps a,b] [--baseline file] [--out file]
 *   tsx run.ts run --findings <dir>               (score saved scanner outputs)
 *       Report recall, precision, time to first finding and total time.
 *       With --baseline, exit 1 if recall or proven precision dropped more than 3 points.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REQUIRED_CLASSES } from "./src/classes.js";
import { BENCH_DIR, coverage, listAppDirs, loadApp, type BenchApp } from "./src/load.js";
import { loadFindings, runScanner, type AppRun } from "./src/runner.js";
import { regressions, scoreApp, totals, type BenchTotals } from "./src/score.js";

const STAGE0 = { apps: 10, vulnerabilities: 60 };

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    strict: { type: "boolean", default: false },
    scanner: { type: "string" },
    findings: { type: "string" },
    apps: { type: "string" },
    baseline: { type: "string" },
    out: { type: "string" },
    "timeout-s": { type: "string", default: "1200" },
  },
});

function loadAll(): { apps: BenchApp[]; errors: string[] } {
  const apps: BenchApp[] = [];
  const errors: string[] = [];
  for (const dir of listAppDirs()) {
    const r = loadApp(dir);
    errors.push(...r.errors);
    if (r.app) apps.push(r.app);
  }
  return { apps, errors };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

async function cmdValidate(): Promise<number> {
  const { apps, errors } = loadAll();
  for (const e of errors) console.error(`error: ${e}`);
  const cov = coverage(apps);
  console.log(
    `apps: ${cov.apps}/${STAGE0.apps}   planted vulnerabilities: ${cov.vulnerabilities}/${STAGE0.vulnerabilities}`,
  );
  for (const c of REQUIRED_CLASSES)
    console.log(`  ${(cov.byClass[c] ?? 0).toString().padStart(3)}  ${c}`);
  const gaps: string[] = [];
  if (cov.apps < STAGE0.apps) gaps.push(`${STAGE0.apps - cov.apps} more apps needed`);
  if (cov.vulnerabilities < STAGE0.vulnerabilities)
    gaps.push(`${STAGE0.vulnerabilities - cov.vulnerabilities} more vulnerabilities needed`);
  if (cov.missingClasses.length)
    gaps.push(`classes not yet covered: ${cov.missingClasses.join(", ")}`);
  console.log(
    gaps.length
      ? `Stage 0 bench criterion NOT met: ${gaps.join("; ")}`
      : "Stage 0 bench criterion met.",
  );
  if (errors.length) return 1;
  return values.strict && gaps.length ? 1 : 0;
}

async function cmdRun(): Promise<number> {
  const { apps: all, errors } = loadAll();
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    return 1;
  }
  const wanted = values.apps?.split(",").map((s) => s.trim());
  const apps = wanted ? all.filter((a) => wanted.includes(a.id)) : all;
  if (!values.scanner && !values.findings) {
    console.error("Pass --scanner '<command with {repo}>' or --findings <dir>.");
    return 2;
  }

  const runs: AppRun[] = [];
  for (const app of apps) {
    const r = values.findings
      ? loadFindings(app, values.findings)
      : await runScanner(app, values.scanner!, Number(values["timeout-s"]) * 1000);
    if (r.error) console.error(`${app.id}: ${r.error}`);
    runs.push(r);
  }

  const scores = apps.map((a) => scoreApp(a, runs.find((r) => r.app === a.id)!.findings));
  const t = totals(apps, scores);
  const firsts = runs
    .map((r) => r.firstFindingMs)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)]! : null);

  console.log("\napp                         recall    TP  dup   FP   time");
  for (const s of scores) {
    const r = runs.find((x) => x.app === s.app)!;
    console.log(
      `${s.app.padEnd(26)} ${`${s.found.length}/${s.expected}`.padStart(7)} ${String(s.truePositives).padStart(5)} ${String(s.duplicates).padStart(4)} ${String(s.falsePositives).padStart(4)} ${(r.totalMs / 1000).toFixed(0).padStart(5)}s`,
    );
  }
  console.log(`\nrecall: ${pct(t.recall)} (${t.found}/${t.expected})`);
  console.log(
    `precision, proven findings: ${pct(t.precisionProven)}   all findings: ${pct(t.precisionAll)}`,
  );
  console.log(
    `time to first finding, median: ${median(firsts) === null ? "n/a" : `${(median(firsts)! / 1000).toFixed(1)}s`}`,
  );
  console.log(`total run time: ${(runs.reduce((n, r) => n + r.totalMs, 0) / 1000).toFixed(0)}s`);
  for (const [cls, r] of Object.entries(t.recallByClass).sort())
    console.log(`  ${cls.padEnd(22)} ${r.found}/${r.expected}`);

  const out =
    values.out ??
    path.join(BENCH_DIR, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        totals: t,
        scores,
        runs: runs.map(({ findings, ...r }) => ({ ...r, findings: findings.length })),
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), out)}`);

  if (values.baseline) {
    const base = (JSON.parse(readFileSync(values.baseline, "utf8")) as { totals: BenchTotals })
      .totals;
    const regs = regressions(base, t);
    for (const r of regs) console.error(`REGRESSION: ${r}`);
    if (regs.length) return 1;
  }
  return runs.some((r) => r.error) ? 1 : 0;
}

const command = positionals[0];
const code =
  command === "validate"
    ? await cmdValidate()
    : command === "run"
      ? await cmdRun()
      : (console.error("usage: run.ts validate|run ..."), 2);
process.exit(code);
