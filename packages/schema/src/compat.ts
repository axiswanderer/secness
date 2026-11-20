/**
 * Backward-compatibility check between a frozen schema and its current version.
 *
 * Allowed without a major version bump:
 *   - adding a new optional property (or a new $defs entry, or a new schema file)
 *   - editing annotations: title, description, examples, $comment
 * Everything else is breaking: removing or retyping a property, changing `required`,
 * changing enums, patterns, formats, bounds, or adding a new constraint.
 */

const ANNOTATIONS = new Set(["title", "description", "examples", "$comment"]);

export interface CompatIssue {
  path: string;
  message: string;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isObj(v: unknown): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameSet(a: Json, b: Json): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const sa = new Set(a.map((x) => JSON.stringify(x)));
  const sb = new Set(b.map((x) => JSON.stringify(x)));
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function compareNode(oldN: Json, newN: Json, path: string, out: CompatIssue[]): void {
  if (isObj(oldN) && isObj(newN)) {
    const keys = new Set([...Object.keys(oldN), ...Object.keys(newN)]);
    for (const k of keys) {
      if (ANNOTATIONS.has(k)) continue;
      const p = `${path}/${k}`;
      const o = oldN[k];
      const n = newN[k];
      if (o === undefined) {
        // New keyword. Only map-like containers may grow (checked below); a new constraint is breaking.
        out.push({ path: p, message: "new constraint keyword added" });
        continue;
      }
      if (n === undefined) {
        out.push({ path: p, message: "keyword removed" });
        continue;
      }
      if (k === "properties" || k === "$defs") {
        if (!isObj(o) || !isObj(n)) {
          out.push({ path: p, message: "malformed map" });
          continue;
        }
        for (const name of Object.keys(o)) {
          if (!(name in n)) out.push({ path: `${p}/${name}`, message: "removed" });
          else compareNode(o[name]!, n[name]!, `${p}/${name}`, out);
        }
        // Additions in properties/$defs are allowed; `required` equality below stops them being mandatory.
        continue;
      }
      if (k === "required" || k === "enum" || k === "type") {
        const ok = Array.isArray(o) ? sameSet(o, n) : JSON.stringify(o) === JSON.stringify(n);
        if (!ok) out.push({ path: p, message: `${k} changed` });
        continue;
      }
      compareNode(o, n, p, out);
    }
    return;
  }
  if (Array.isArray(oldN) && Array.isArray(newN)) {
    if (oldN.length !== newN.length) {
      out.push({ path, message: "array length changed" });
      return;
    }
    oldN.forEach((o, i) => compareNode(o, newN[i]!, `${path}/${i}`, out));
    return;
  }
  if (JSON.stringify(oldN) !== JSON.stringify(newN)) {
    out.push({ path, message: `changed from ${JSON.stringify(oldN)} to ${JSON.stringify(newN)}` });
  }
}

/** Compare whole schema sets keyed by file name. New files are allowed; removed files are breaking. */
export function checkCompat(
  frozen: Record<string, unknown>,
  current: Record<string, unknown>,
): CompatIssue[] {
  const out: CompatIssue[] = [];
  for (const [file, oldSchema] of Object.entries(frozen)) {
    const newSchema = current[file];
    if (newSchema === undefined) {
      out.push({ path: file, message: "schema file removed" });
      continue;
    }
    compareNode(oldSchema as Json, newSchema as Json, file, out);
  }
  return out;
}
