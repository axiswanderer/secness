/**
 * Generates src/generated/types.ts from schemas/v1/*.schema.json.
 *
 * Runtime validation (ajv) is a tolerant reader: unknown properties are allowed,
 * so additive changes don't break older consumers. The generated TS types are
 * closed (additionalProperties: false) so typos fail at compile time.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(here, "..", "schemas", "v1");
const outFile = path.join(here, "..", "src", "generated", "types.ts");

/** Strip $id so the ref parser resolves sibling files from disk, never over the network. */
function stripIds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripIds);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) if (k !== "$id") out[k] = stripIds(v);
    return out;
  }
  return node;
}

const files = (await readdir(schemaDir)).filter((f) => f.endsWith(".schema.json")).sort();
const properties: Record<string, JSONSchema> = {};
for (const f of files.filter((name) => name !== "common.schema.json")) {
  const schema = JSON.parse(await readFile(path.join(schemaDir, f), "utf8")) as JSONSchema;
  properties[String(schema.title)] = { $ref: f };
}

const root = stripIds({
  title: "SecNessContractsV1",
  type: "object",
  properties,
}) as JSONSchema;

const ts = await compile(root, "SecNessContractsV1", {
  cwd: schemaDir,
  additionalProperties: false,
  declareExternallyReferenced: true,
  unreachableDefinitions: true,
  bannerComment:
    "/* eslint-disable */\n/**\n * GENERATED FILE — do not edit. Source: packages/schema/schemas/v1.\n * Regenerate with `pnpm schema:gen`.\n */",
  format: true,
  strictIndexSignatures: true,
});

// The synthetic bundle wrapper is only a codegen device; drop it from the output.
const cleaned = ts.replace(/export interface SecNessContractsV1 \{[\s\S]*?\n\}\n/, "");
await writeFile(outFile, cleaned);
console.log(`wrote ${path.relative(process.cwd(), outFile)} from ${files.length} schemas`);
