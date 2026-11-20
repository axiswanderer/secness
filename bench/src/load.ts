import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { parse as parseYaml } from "yaml";
import { REQUIRED_CLASSES, VULN_CLASSES, type VulnClass } from "./classes.js";

export const BENCH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APPS_DIR = path.join(BENCH_DIR, "apps");

export interface ExpectedVuln {
  id: string;
  class: VulnClass;
  cwe: string;
  file: string;
  lines: [number, number];
  snippet: string;
  endpoint?: string | null;
  detectable_by: ("static" | "dynamic" | "ai-agent")[];
  description: string;
}

export interface KnownExtra {
  cwe: string;
  file: string;
  endpoint?: string | null;
  note?: string;
}

export interface BenchApp {
  id: string;
  name: string;
  dir: string;
  sourceDir: string;
  stack: { language: string; framework: string; frontend?: string | null; db?: string | null };
  provenance: {
    generator: string;
    model?: string | null;
    prompt: string;
    clean_commit?: string | null;
  };
  vulnerabilities: ExpectedVuln[];
  known_extras: KnownExtra[];
}

const addFormats = addFormatsModule.default;
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateExpected = ajv.compile(
  JSON.parse(readFileSync(path.join(BENCH_DIR, "expected.schema.json"), "utf8")),
);

export function loadApp(dir: string): { app?: BenchApp; errors: string[] } {
  const file = path.join(dir, "expected.yaml");
  const errors: string[] = [];
  if (!existsSync(file)) return { errors: [`${dir}: missing expected.yaml`] };
  const raw = parseYaml(readFileSync(file, "utf8")) as Record<string, unknown>;
  if (!validateExpected(raw)) {
    return { errors: [`${file}: ${ajv.errorsText(validateExpected.errors)}`] };
  }
  const data = raw as unknown as Omit<BenchApp, "dir" | "sourceDir"> & { source_dir: string };
  const sourceDir = path.join(dir, data.source_dir);
  if (path.basename(dir) !== data.id)
    errors.push(`${file}: id ${data.id} must match directory name`);
  if (!existsSync(path.join(dir, data.provenance.prompt)))
    errors.push(`${file}: prompt file not found`);
  if (!existsSync(sourceDir)) errors.push(`${file}: source_dir ${data.source_dir} not found`);

  const ids = new Set<string>();
  for (const v of data.vulnerabilities) {
    const where = `${data.id}/${v.id}`;
    if (ids.has(v.id)) errors.push(`${where}: duplicate id`);
    ids.add(v.id);
    if (!(VULN_CLASSES[v.class].cwes as readonly string[]).includes(v.cwe)) {
      errors.push(`${where}: ${v.cwe} is not an accepted CWE for class ${v.class}`);
    }
    const src = path.join(sourceDir, v.file);
    if (!existsSync(src) || !statSync(src).isFile()) {
      errors.push(`${where}: file ${v.file} not found`);
      continue;
    }
    const lines = readFileSync(src, "utf8").split("\n");
    const [start, end] = v.lines;
    if (start > end || end > lines.length) {
      errors.push(`${where}: lines ${start}-${end} out of range (file has ${lines.length})`);
      continue;
    }
    if (
      !lines
        .slice(start - 1, end)
        .join("\n")
        .includes(v.snippet)
    ) {
      errors.push(
        `${where}: snippet ${JSON.stringify(v.snippet)} not found in ${v.file}:${start}-${end}`,
      );
    }
  }
  return {
    app: { ...data, dir, sourceDir, known_extras: data.known_extras ?? [] },
    errors,
  };
}

export function listAppDirs(root: string = APPS_DIR): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((d) => path.join(root, d))
    .filter((d) => statSync(d).isDirectory())
    .sort();
}

export interface BenchCoverage {
  apps: number;
  vulnerabilities: number;
  byClass: Record<string, number>;
  missingClasses: VulnClass[];
}

export function coverage(apps: BenchApp[]): BenchCoverage {
  const byClass: Record<string, number> = {};
  for (const a of apps)
    for (const v of a.vulnerabilities) byClass[v.class] = (byClass[v.class] ?? 0) + 1;
  return {
    apps: apps.length,
    vulnerabilities: apps.reduce((n, a) => n + a.vulnerabilities.length, 0),
    byClass,
    missingClasses: REQUIRED_CLASSES.filter((c) => !byClass[c]),
  };
}
