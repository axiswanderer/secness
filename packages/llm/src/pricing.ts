/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Built-in prices for Anthropic models (first-party API rates, Nov 2026). Cache writes are
 * priced at 1.25x input (5-minute TTL). Other providers' prices must be configured explicitly:
 * the spend cap cannot be enforced for a model with no known price, so such a model is refused.
 */
export const BUILTIN_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  // Prompts up to 100K tokens; SecNess prompts stay well under that.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
});

export class PriceTable {
  private readonly prices: Map<string, ModelPrice>;

  constructor(extra: Record<string, ModelPrice> = {}) {
    this.prices = new Map(Object.entries({ ...BUILTIN_PRICES, ...extra }));
  }

  has(model: string): boolean {
    return this.prices.has(model);
  }

  get(model: string): ModelPrice | undefined {
    return this.prices.get(model);
  }

  /** The most expensive known price: used to charge conservatively for an unpriced model. */
  ceiling(): ModelPrice {
    let max: ModelPrice = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const p of this.prices.values()) {
      max = {
        input: Math.max(max.input, p.input),
        output: Math.max(max.output, p.output),
        cacheRead: Math.max(max.cacheRead, p.cacheRead),
        cacheWrite: Math.max(max.cacheWrite, p.cacheWrite),
      };
    }
    return max;
  }
}

export function costUsd(
  price: ModelPrice,
  u: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  },
): number {
  return (
    (u.inputTokens * price.input +
      u.outputTokens * price.output +
      u.cacheReadTokens * price.cacheRead +
      u.cacheWriteTokens * price.cacheWrite) /
    1e6
  );
}
