import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import type { LlmCallRecord } from "@secness/schema";
import { SpendBudget, SpendCapExceededError } from "./budget.js";
import { costUsd, PriceTable, type ModelPrice } from "./pricing.js";
import {
  textOf,
  type LlmDriver,
  type Message,
  type StopReason,
  type ToolSpec,
  type TurnRequest,
  type TurnResult,
  type Usage,
} from "./types.js";

export class SourceCodeConsentError extends Error {
  constructor() {
    super(
      "This call would send source code to an LLM provider, and the user has not opted in. " +
        "Enable it in `secness init` (llm.allow_source_code).",
    );
    this.name = "SourceCodeConsentError";
  }
}

export class LlmRefusalError extends Error {
  constructor(readonly explanation: string | undefined) {
    super(`The model declined the request${explanation ? `: ${explanation}` : ""}`);
    this.name = "LlmRefusalError";
  }
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export interface CallOptions {
  /** What the call is for; recorded on the run (e.g. "feedback-composer"). */
  purpose: string;
  /** Set when the prompt includes repo source. Refused unless the user opted in. */
  containsSourceCode?: boolean;
  model?: string;
  system?: string;
  maxOutputTokens?: number;
}

export interface LlmTool {
  spec: ToolSpec;
  /** Returns the tool result text. Throwing reports an error result to the model. */
  run(input: unknown): Promise<string>;
}

export interface ToolLoopResult {
  messages: Message[];
  text: string;
  steps: number;
  stopReason: StopReason | "max_steps";
}

export interface LlmClientOptions {
  driver: LlmDriver;
  /** Shared per-run budget. Defaults to a fresh $1 cap. */
  budget?: SpendBudget;
  /** Receives one record per model call, for the Run's llm_calls. */
  onCall?: (record: LlmCallRecord) => void;
  /** User consent to send source code (shown and asked in `secness init`). Default false. */
  allowSourceCode?: boolean;
  prices?: Record<string, ModelPrice>;
  defaultMaxOutputTokens?: number;
  now?: () => Date;
}

/** Below this many affordable output tokens, a call is not worth starting. */
const MIN_OUTPUT_TOKENS = 256;

/** Upper bound on tokens the provider adds around messages, tools and the system prompt. */
const FRAMING_TOKENS = 1024;

/** A strict upper bound on input tokens: byte-level BPE never yields more tokens than bytes. */
export function maxInputTokens(req: Omit<TurnRequest, "maxOutputTokens">): number {
  const payload = JSON.stringify([
    req.system ?? "",
    req.messages,
    req.tools ?? [],
    req.responseSchema ?? null,
  ]);
  return Buffer.byteLength(payload, "utf8") + FRAMING_TOKENS + 8 * req.messages.length;
}

/**
 * The one LLM entry point for SecNess. Provider-agnostic; every call is metered,
 * recorded, consent-checked, and held under the run's hard spend cap.
 */
export class LlmClient {
  readonly budget: SpendBudget;
  private readonly driver: LlmDriver;
  private readonly prices: PriceTable;
  private readonly opts: LlmClientOptions;
  private readonly ajv = new Ajv2020({ allErrors: true, strict: false });
  private readonly validators = new WeakMap<object, ValidateFunction>();

  constructor(opts: LlmClientOptions) {
    this.opts = opts;
    this.driver = opts.driver;
    this.budget = opts.budget ?? new SpendBudget();
    this.prices = new PriceTable(opts.prices);
    this.priceFor(this.driver.defaultModel); // fail fast on an unpriced default model
  }

  /** Single prompt in, text out. */
  async complete(prompt: string, opts: CallOptions): Promise<{ text: string; usage: Usage }> {
    const r = await this.turn(
      { messages: [userText(prompt)], system: opts.system, model: opts.model },
      opts,
    );
    if (r.stopReason === "refusal") throw new LlmRefusalError(r.refusal);
    return { text: textOf(r.message), usage: r.usage };
  }

  /**
   * Output constrained to a JSON Schema and validated locally. One retry with the
   * validation errors fed back; then StructuredOutputError.
   */
  async completeStructured<T>(
    prompt: string,
    schema: Record<string, unknown>,
    opts: CallOptions,
  ): Promise<T> {
    const validate = this.validatorFor(schema);
    const messages: Message[] = [userText(prompt)];
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await this.turn(
        { messages, system: opts.system, model: opts.model, responseSchema: schema },
        opts,
      );
      if (r.stopReason === "refusal") throw new LlmRefusalError(r.refusal);
      const raw = textOf(r.message);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        lastError = "response was not valid JSON";
        messages.push(r.message, userText(`Your reply was not valid JSON. Reply with JSON only.`));
        continue;
      }
      if (validate(parsed)) return parsed as T;
      lastError = this.ajv.errorsText(validate.errors);
      messages.push(
        r.message,
        userText(
          `Your JSON did not match the schema: ${lastError}. Reply with corrected JSON only.`,
        ),
      );
      if (attempt === 1) throw new StructuredOutputError(`schema mismatch: ${lastError}`, raw);
    }
    throw new StructuredOutputError(lastError, "");
  }

  /**
   * Runs a tool-use loop until the model stops calling tools or maxSteps is reached.
   * Tool inputs are validated against each tool's schema before the tool runs.
   */
  async toolLoop(
    input: { messages: Message[]; tools: LlmTool[]; maxSteps: number },
    opts: CallOptions,
  ): Promise<ToolLoopResult> {
    const byName = new Map(input.tools.map((t) => [t.spec.name, t]));
    const messages = [...input.messages];
    let steps = 0;
    let last: TurnResult | undefined;
    while (steps < input.maxSteps) {
      last = await this.turn(
        { messages, system: opts.system, model: opts.model, tools: input.tools.map((t) => t.spec) },
        opts,
      );
      steps++;
      messages.push(last.message);
      if (last.stopReason !== "tool_use") {
        return { messages, text: textOf(last.message), steps, stopReason: last.stopReason };
      }
      const results: Message = { role: "user", parts: [] };
      for (const part of last.message.parts) {
        if (part.type !== "tool_call") continue;
        results.parts.push(await this.runTool(byName.get(part.name), part.id, part.input));
      }
      messages.push(results);
    }
    return { messages, text: last ? textOf(last.message) : "", steps, stopReason: "max_steps" };
  }

  private async runTool(
    tool: LlmTool | undefined,
    id: string,
    input: unknown,
  ): Promise<Message["parts"][number]> {
    if (!tool)
      return { type: "tool_result", toolCallId: id, content: "Unknown tool.", isError: true };
    const validate = this.validatorFor(tool.spec.inputSchema);
    if (!validate(input)) {
      return {
        type: "tool_result",
        toolCallId: id,
        content: `Invalid input: ${this.ajv.errorsText(validate.errors)}`,
        isError: true,
      };
    }
    try {
      return { type: "tool_result", toolCallId: id, content: await tool.run(input) };
    } catch (e) {
      return {
        type: "tool_result",
        toolCallId: id,
        content: e instanceof Error ? e.message : String(e),
        isError: true,
      };
    }
  }

  /** The single metered path to the provider. */
  private async turn(
    req: Omit<TurnRequest, "maxOutputTokens">,
    opts: CallOptions,
  ): Promise<TurnResult> {
    if (opts.containsSourceCode && !this.opts.allowSourceCode) throw new SourceCodeConsentError();
    const model = req.model ?? this.driver.defaultModel;
    const price = this.priceFor(model);

    // Bound the cost before calling, then clamp output to what is left. Both supported
    // providers use byte-level BPE, so a prompt never has more tokens than UTF-8 bytes;
    // FRAMING_TOKENS covers the provider's own message/tool formatting.
    const worstInputTokens = maxInputTokens(req);
    const inputCost = (worstInputTokens * price.input) / 1e6;
    const remaining = this.budget.remainingUsd;
    const affordableOutput = Math.floor(((remaining - inputCost) * 1e6) / price.output);
    const requested = opts.maxOutputTokens ?? this.opts.defaultMaxOutputTokens ?? 16_000;
    const maxOutputTokens = Math.min(requested, affordableOutput);
    if (maxOutputTokens < Math.min(MIN_OUTPUT_TOKENS, requested)) {
      throw new SpendCapExceededError(
        this.budget.capUsd,
        this.budget.spentUsd,
        inputCost + (MIN_OUTPUT_TOKENS * price.output) / 1e6,
      );
    }

    const started = performance.now();
    const result = await this.driver.turn({ ...req, model, maxOutputTokens });
    const latency = Math.round(performance.now() - started);

    // Charge at the price of the model that actually served it (fallbacks can switch models).
    const servedPrice = this.prices.get(result.model) ?? this.prices.ceiling();
    const cost = costUsd(servedPrice, result.usage);
    this.budget.charge(cost);
    this.opts.onCall?.({
      provider: this.driver.provider,
      model: result.model,
      purpose: opts.purpose,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cache_read_tokens: result.usage.cacheReadTokens,
      cost_usd: Number(cost.toFixed(6)),
      latency_ms: latency,
      at: (this.opts.now?.() ?? new Date()).toISOString(),
    });
    return result;
  }

  private priceFor(model: string): ModelPrice {
    const p = this.prices.get(model);
    if (!p) {
      throw new Error(
        `No price configured for model "${model}". The spend cap cannot be enforced without one; ` +
          "add it to llm.prices.",
      );
    }
    return p;
  }

  private validatorFor(schema: Record<string, unknown>): ValidateFunction {
    let v = this.validators.get(schema);
    if (!v) {
      v = this.ajv.compile(schema);
      this.validators.set(schema, v);
    }
    return v;
  }
}

function userText(text: string): Message {
  return { role: "user", parts: [{ type: "text", text }] };
}
