import { describe, expect, it } from "vitest";
import { isId, newId, ulid } from "../src/ids.js";
import { validate } from "../src/validate.js";
import * as ex from "./fixtures/examples.js";

describe("ids", () => {
  it("generates ids that the schemas accept", () => {
    const id = newId("fnd");
    expect(isId(id, "fnd")).toBe(true);
    expect(isId(id, "run")).toBe(false);
    expect(validate("Finding", { ...ex.finding, id }).ok).toBe(true);
  });

  it("sorts by time", () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
  });

  it("is unique across many calls", () => {
    const s = new Set(Array.from({ length: 10_000 }, () => newId("run")));
    expect(s.size).toBe(10_000);
  });
});
