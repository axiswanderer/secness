/** One-time: copy schemas/v1 to schemas/frozen/v1. Refuses to overwrite an existing snapshot. */
import { cp, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "schemas", "frozen", "v1");
await mkdir(dest, { recursive: true });
if ((await readdir(dest)).length > 0) {
  console.error("schemas/frozen/v1 already exists. v1 is frozen; it is never re-frozen.");
  process.exit(1);
}
await cp(path.join(root, "schemas", "v1"), dest, { recursive: true });
console.log("froze schemas/v1 -> schemas/frozen/v1");
