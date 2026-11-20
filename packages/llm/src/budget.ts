export class SpendCapExceededError extends Error {
  constructor(
    readonly capUsd: number,
    readonly spentUsd: number,
    readonly neededUsd: number,
  ) {
    super(
      `LLM spend cap reached: cap $${capUsd.toFixed(4)}, spent $${spentUsd.toFixed(4)}, ` +
        `next call needs at least $${neededUsd.toFixed(4)}`,
    );
    this.name = "SpendCapExceededError";
  }
}

/** Default per-run cap for Stage 1 (section 0.4). */
export const DEFAULT_RUN_CAP_USD = 1;

/**
 * A hard per-run spend cap, shared by every LlmClient in the run.
 * Calls are refused before they start if the worst-case input cost alone would exceed
 * what is left, and output is clamped so the worst case of a single call fits.
 */
export class SpendBudget {
  private spent = 0;

  constructor(readonly capUsd: number = DEFAULT_RUN_CAP_USD) {
    if (!(capUsd >= 0) || !Number.isFinite(capUsd)) throw new RangeError("capUsd must be >= 0");
  }

  get spentUsd(): number {
    return this.spent;
  }

  get remainingUsd(): number {
    return Math.max(0, this.capUsd - this.spent);
  }

  charge(usd: number): void {
    this.spent += usd;
  }
}
