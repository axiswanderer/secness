import { describe, expect, it } from "vitest";
import { checkCompat } from "../src/compat.js";

const base = {
  "x.schema.json": {
    title: "X",
    type: "object",
    required: ["a"],
    properties: {
      a: { type: "string", description: "old" },
      e: { type: "string", enum: ["one", "two"] },
    },
  },
};
const clone = () => structuredClone(base) as { "x.schema.json": Record<string, any> };

describe("schema compat check", () => {
  it("accepts an identical schema", () => {
    expect(checkCompat(base, clone())).toEqual([]);
  });

  it("accepts annotation edits and new optional properties", () => {
    const n = clone();
    n["x.schema.json"].properties.a.description = "new";
    n["x.schema.json"].properties.b = { type: "integer" };
    expect(checkCompat(base, n)).toEqual([]);
  });

  it("accepts a new schema file", () => {
    expect(checkCompat(base, { ...clone(), "y.schema.json": {} })).toEqual([]);
  });

  it.each([
    ["removing a property", (s: any) => delete s.properties.a],
    ["retyping a property", (s: any) => (s.properties.a.type = "integer")],
    ["adding a required field", (s: any) => s.required.push("e")],
    ["removing a required field", (s: any) => (s.required = [])],
    ["adding an enum value", (s: any) => s.properties.e.enum.push("three")],
    ["adding a constraint", (s: any) => (s.properties.a.minLength = 3)],
  ])("rejects %s", (_name, mutate) => {
    const n = clone();
    mutate(n["x.schema.json"]);
    expect(checkCompat(base, n).length).toBeGreaterThan(0);
  });

  it("rejects removing a schema file", () => {
    expect(checkCompat(base, {})).toHaveLength(1);
  });
});
