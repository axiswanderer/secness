import { describe, expect, it } from "vitest";
import { validate } from "@secness/schema";
import { canTransition, createRun, IllegalTransitionError, transition } from "../src/run-state.js";

describe("run state machine", () => {
  it("walks the happy path and produces a schema-valid run", () => {
    let run = createRun({ mode: "incremental", changeEventId: null });
    for (const s of [
      "profiling",
      "building",
      "scanning",
      "validating",
      "reporting",
      "done",
    ] as const) {
      run = transition(run, s);
    }
    expect(run.state).toBe("done");
    expect(run.timings.map((t) => t.state)).toEqual([
      "queued",
      "profiling",
      "building",
      "scanning",
      "validating",
      "reporting",
      "done",
    ]);
    expect(run.timings.every((t) => t.ended_at !== null)).toBe(true);
    const r = validate("Run", run);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("lets a build failure go straight to reporting (could not start)", () => {
    let run = createRun({ mode: "incremental", changeEventId: null });
    run = transition(transition(run, "profiling"), "building");
    expect(canTransition(run.state, "reporting")).toBe(true);
  });

  it("rejects skipping states", () => {
    const run = createRun({ mode: "full", changeEventId: null });
    expect(() => transition(run, "scanning")).toThrow(IllegalTransitionError);
  });

  it("requires an error to fail, and never leaves a terminal state", () => {
    const run = createRun({ mode: "full", changeEventId: null });
    expect(() => transition(run, "failed")).toThrow(/requires an error/);
    const failed = transition(run, "failed", {
      error: { code: "cancelled", message: "superseded" },
    });
    expect(failed.error?.code).toBe("cancelled");
    expect(() => transition(failed, "profiling")).toThrow(IllegalTransitionError);
  });
});
