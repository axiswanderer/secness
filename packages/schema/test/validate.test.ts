import { describe, expect, it } from "vitest";
import { assertValid, ContractValidationError, validate } from "../src/validate.js";
import * as ex from "./fixtures/examples.js";

describe("v1 contracts accept the canonical examples", () => {
  it.each([
    ["ChangeEvent", ex.changeEvent],
    ["TargetProfile", ex.targetProfile],
    ["TestPlan", ex.testPlan],
    ["Finding", ex.finding],
    ["Run", ex.run],
    ["GateResult", ex.gateResult],
    ["Verdict", ex.verdict],
  ] as const)("%s", (name, value) => {
    const r = validate(name, value);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
});

describe("v1 contracts reject bad input", () => {
  it("rejects a finding id with the wrong prefix", () => {
    const r = validate("Finding", { ...ex.finding, id: "run_01HZY3Q8K2M4N6P8R0T2V4X6Z9" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown finding status", () => {
    expect(validate("Finding", { ...ex.finding, status: "closed_by_agent" }).ok).toBe(false);
  });

  it("rejects a finding with no detector", () => {
    expect(validate("Finding", { ...ex.finding, detected_by: [] }).ok).toBe(false);
  });

  it.each(["/etc/passwd", "../outside.ts", "src/../../x", "C:\\x.ts", "\\\\share\\x"])(
    "rejects path %s that is absolute or escapes the repo",
    (p) => {
      const r = validate("ChangeEvent", {
        ...ex.changeEvent,
        changed_files: [{ path: p, status: "modified" }],
      });
      expect(r.ok).toBe(false);
    },
  );

  it("accepts dotfiles and names containing dots", () => {
    const r = validate("ChangeEvent", {
      ...ex.changeEvent,
      changed_files: [{ path: ".github/x..y/a.ts", status: "added" }],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a malformed endpoint", () => {
    const r = validate("TestPlan", {
      ...ex.testPlan,
      dynamic: [{ suite: "access-control.bola", targets: ["FETCH /x"] }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an out-of-range gate score", () => {
    expect(validate("GateResult", { ...ex.gateResult, score: 101 }).ok).toBe(false);
  });

  it("rejects a bad timestamp", () => {
    expect(validate("Verdict", { ...ex.verdict, checked_at: "yesterday" }).ok).toBe(false);
  });

  it("is a tolerant reader: unknown properties are accepted", () => {
    expect(validate("Finding", { ...ex.finding, future_field: 1 }).ok).toBe(true);
  });

  it("assertValid throws a typed error listing every problem", () => {
    expect(() => assertValid("GateResult", { policy: "nope" })).toThrow(ContractValidationError);
  });
});
