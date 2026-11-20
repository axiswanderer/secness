import {
  newId,
  type ChangeEventId,
  type Run,
  type RunError,
  type RunMode,
  type RunState,
} from "@secness/schema";

/**
 * Legal Run state transitions (section 3). Any state may move to `failed`.
 * building -> reporting covers "could not start": the app failed to build or boot,
 * which is reported to the agent as a result rather than silently dropped.
 */
const NEXT: Record<RunState, readonly RunState[]> = {
  queued: ["profiling"],
  profiling: ["building"],
  building: ["scanning", "reporting"],
  scanning: ["validating"],
  validating: ["reporting"],
  reporting: ["done"],
  done: [],
  failed: [],
};

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set(["done", "failed"]);

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: RunState,
    readonly to: RunState,
  ) {
    super(`Illegal run transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: RunState, to: RunState): boolean {
  if (TERMINAL_STATES.has(from)) return false;
  return to === "failed" || NEXT[from].includes(to);
}

export function createRun(opts: {
  mode: RunMode;
  changeEventId: ChangeEventId | null;
  now?: Date;
}): Run {
  const at = (opts.now ?? new Date()).toISOString();
  return {
    id: newId("run"),
    change_event_id: opts.changeEventId,
    mode: opts.mode,
    state: "queued",
    timings: [{ state: "queued", started_at: at, ended_at: null }],
    finding_ids: [],
    gate_result: null,
    error: null,
    llm_calls: [],
    created_at: at,
  };
}

/** Returns a new Run in state `to`, closing the timing of the current state. Pure. */
export function transition(
  run: Run,
  to: RunState,
  opts: { now?: Date; error?: RunError } = {},
): Run {
  if (!canTransition(run.state, to)) throw new IllegalTransitionError(run.state, to);
  if (to === "failed" && !opts.error) throw new Error("A transition to failed requires an error");
  const at = (opts.now ?? new Date()).toISOString();
  const timings = run.timings.map((t, i) =>
    i === run.timings.length - 1 && t.ended_at === null ? { ...t, ended_at: at } : t,
  );
  // Terminal states are instants: they open and close at the same time.
  timings.push({ state: to, started_at: at, ended_at: TERMINAL_STATES.has(to) ? at : null });
  return { ...run, state: to, timings, error: opts.error ?? run.error ?? null };
}
