import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { validate, type Finding } from "@secness/schema";
import type { BenchApp } from "./load.js";

/**
 * Scanner protocol. The scanner command gets the app's source dir in place of `{repo}` and
 * prints one JSON object to stdout:  { "findings": Finding[], "first_finding_ms"?: number }.
 * In Stage 1 this is `secness scan --full --json --repo {repo}`.
 */
export interface ScanOutput {
  findings: Finding[];
  first_finding_ms?: number;
}

export interface AppRun {
  app: string;
  findings: Finding[];
  totalMs: number;
  firstFindingMs: number | null;
  error?: string;
}

function parseOutput(raw: string, origin: string): ScanOutput {
  const data = JSON.parse(raw) as { findings?: unknown[]; first_finding_ms?: number };
  if (!Array.isArray(data.findings)) throw new Error(`${origin}: output has no findings array`);
  const findings = data.findings.map((f, i) => {
    const r = validate("Finding", f);
    if (!r.ok)
      throw new Error(`${origin}: finding ${i} is not a valid v1 Finding: ${r.errors.join("; ")}`);
    return r.value;
  });
  return {
    findings,
    ...(data.first_finding_ms !== undefined ? { first_finding_ms: data.first_finding_ms } : {}),
  };
}

export async function runScanner(
  app: BenchApp,
  command: string,
  timeoutMs: number,
): Promise<AppRun> {
  const started = performance.now();
  const cmd = command.replaceAll("{repo}", JSON.stringify(app.sourceDir));
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const totalMs = Math.round(performance.now() - started);
      const fail = (error: string): void =>
        resolve({ app: app.id, findings: [], totalMs, firstFindingMs: null, error });
      if (signal) return fail(`scanner killed by ${signal} (timeout ${timeoutMs} ms?)`);
      if (code !== 0 && code !== 1) return fail(`scanner exited with ${code}`); // 1 = gate failed
      try {
        const parsed = parseOutput(out, app.id);
        resolve({
          app: app.id,
          findings: parsed.findings,
          totalMs,
          firstFindingMs: parsed.first_finding_ms ?? null,
        });
      } catch (e) {
        fail(String(e));
      }
    });
  });
}

/** Scores precomputed results: <dir>/<app-id>.json in the scanner output format. */
export function loadFindings(app: BenchApp, dir: string): AppRun {
  const file = path.join(dir, `${app.id}.json`);
  if (!existsSync(file))
    return {
      app: app.id,
      findings: [],
      totalMs: 0,
      firstFindingMs: null,
      error: "no results file",
    };
  const parsed = parseOutput(readFileSync(file, "utf8"), file);
  return {
    app: app.id,
    findings: parsed.findings,
    totalMs: 0,
    firstFindingMs: parsed.first_finding_ms ?? null,
  };
}
