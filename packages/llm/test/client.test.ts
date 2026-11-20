import { describe, expect, it } from "vitest";
import { validate, type LlmCallRecord } from "@secness/schema";
import {
  LlmClient,
  LlmRefusalError,
  SourceCodeConsentError,
  StructuredOutputError,
} from "../src/client.js";
import { SpendBudget, SpendCapExceededError } from "../src/budget.js";
import type { LlmDriver, TurnRequest, TurnResult } from "../src/types.js";

type Script = (req: TurnRequest, i: number) => Partial<TurnResult> & { text?: string };

/** A driver that replays scripted turns and records every request. */
function fakeDriver(script: Script, model = "claude-opus-5-5") {
  const requests: TurnRequest[] = [];
  const driver: LlmDriver = {
    provider: "fake",
    defaultModel: model,
    async turn(req) {
      requests.push(structuredClone(req));
      const s = script(req, requests.length - 1);
      return {
        message: s.message ?? { role: "assistant", parts: [{ type: "text", text: s.text ?? "" }] },
        stopReason: s.stopReason ?? "end",
        // Like a real model, never emits more than max_tokens.
        usage: s.usage ?? {
          inputTokens: 1000,
          outputTokens: Math.min(500, req.maxOutputTokens),
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        model: s.model ?? model,
        ...(s.refusal ? { refusal: s.refusal } : {}),
      };
    },
  };
  return { driver, requests };
}

const opts = { purpose: "test" };

describe("metering", () => {
  it("records model, tokens, cost and latency as a schema-valid LlmCallRecord", async () => {
    const records: LlmCallRecord[] = [];
    const { driver } = fakeDriver(() => ({ text: "hi" }));
    const client = new LlmClient({ driver, onCall: (r) => records.push(r) });
    await client.complete("hello", opts);
    expect(records).toHaveLength(1);
    // 1000 in * $4/M + 500 out * $20/M
    expect(records[0]!.cost_usd).toBeCloseTo(0.014, 6);
    expect(records[0]!.purpose).toBe("test");
    expect(client.budget.spentUsd).toBeCloseTo(0.014, 6);
    const run = {
      id: "run_01HZY3Q8K2M4N6P8R0T2V4X6Z8",
      change_event_id: null,
      mode: "full",
      state: "done",
      timings: [],
      finding_ids: [],
      gate_result: null,
      llm_calls: records,
      created_at: new Date().toISOString(),
    };
    expect(validate("Run", run).ok).toBe(true);
  });

  it("charges at the price of the model that actually served the call", async () => {
    const { driver } = fakeDriver(() => ({ text: "x", model: "claude-sonnet-5-5" }));
    const client = new LlmClient({ driver });
    await client.complete("x", opts);
    expect(client.budget.spentUsd).toBeCloseTo((1000 * 2 + 500 * 10) / 1e6, 9);
  });

  it("charges an unknown served model at the ceiling price, never zero", async () => {
    const { driver } = fakeDriver(() => ({ text: "x", model: "mystery-model" }));
    const client = new LlmClient({ driver });
    await client.complete("x", opts);
    expect(client.budget.spentUsd).toBeCloseTo((1000 * 8 + 500 * 40) / 1e6, 9);
  });

  it("refuses a default model with no price", () => {
    const { driver } = fakeDriver(() => ({}), "gpt-unpriced");
    expect(() => new LlmClient({ driver })).toThrow(/No price configured/);
  });
});

describe("spend cap", () => {
  it("clamps max output tokens to what the remaining budget can pay for", async () => {
    const { driver, requests } = fakeDriver(() => ({ text: "x" }));
    const client = new LlmClient({ driver, budget: new SpendBudget(0.1) });
    await client.complete("short", { ...opts, maxOutputTokens: 64_000 });
    // $0.1 / $20 per M output = 5000 tokens, minus the worst-case input cost.
    expect(requests[0]!.maxOutputTokens).toBeLessThan(5000);
    expect(requests[0]!.maxOutputTokens).toBeGreaterThan(4700);
  });

  it("refuses a call before it starts once the cap is spent, and the budget is shared", async () => {
    const budget = new SpendBudget(0.016);
    const { driver, requests } = fakeDriver(() => ({ text: "x" }));
    const a = new LlmClient({ driver, budget });
    const b = new LlmClient({ driver, budget });
    await a.complete("one", opts); // $0.014
    await expect(b.complete("two", opts)).rejects.toThrow(SpendCapExceededError);
    expect(requests).toHaveLength(1);
  });

  it("never lets total spend pass the cap across many calls", async () => {
    // Worst case the bound must survive: the provider bills every byte as a token,
    // and the model uses all the output it is allowed.
    const { driver } = fakeDriver((req) => ({
      text: "x",
      usage: {
        inputTokens: Buffer.byteLength(JSON.stringify(req.messages), "utf8"),
        outputTokens: req.maxOutputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    }));
    const client = new LlmClient({ driver, budget: new SpendBudget(0.05) });
    let refused = false;
    for (let i = 0; i < 20 && !refused; i++) {
      await client.complete("é漢".repeat(500), { ...opts, maxOutputTokens: 400 }).catch((e) => {
        expect(e).toBeInstanceOf(SpendCapExceededError);
        refused = true;
      });
    }
    expect(refused).toBe(true);
    expect(client.budget.spentUsd).toBeLessThanOrEqual(0.05);
  });

  it("defaults to a $1 cap", () => {
    expect(new SpendBudget().capUsd).toBe(1);
  });
});

describe("source code consent", () => {
  it("refuses source code unless the user opted in", async () => {
    const { driver, requests } = fakeDriver(() => ({ text: "x" }));
    await expect(
      new LlmClient({ driver }).complete("code", { ...opts, containsSourceCode: true }),
    ).rejects.toThrow(SourceCodeConsentError);
    expect(requests).toHaveLength(0);
    await new LlmClient({ driver, allowSourceCode: true }).complete("code", {
      ...opts,
      containsSourceCode: true,
    });
    expect(requests).toHaveLength(1);
  });
});

describe("completeStructured", () => {
  const schema = {
    type: "object",
    required: ["severity"],
    properties: { severity: { enum: ["high", "low"] } },
  };

  it("returns validated output and passes the schema to the provider", async () => {
    const { driver, requests } = fakeDriver(() => ({ text: '{"severity":"high"}' }));
    const out = await new LlmClient({ driver }).completeStructured<{ severity: string }>(
      "q",
      schema,
      opts,
    );
    expect(out.severity).toBe("high");
    expect(requests[0]!.responseSchema).toEqual(schema);
  });

  it("retries once with the validation error, then succeeds", async () => {
    const { driver, requests } = fakeDriver((_r, i) => ({
      text: i === 0 ? '{"severity":"urgent"}' : '{"severity":"low"}',
    }));
    const out = await new LlmClient({ driver }).completeStructured<{ severity: string }>(
      "q",
      schema,
      opts,
    );
    expect(out.severity).toBe("low");
    expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain("did not match the schema");
  });

  it("gives up after the retry", async () => {
    const { driver } = fakeDriver(() => ({ text: '{"severity":"urgent"}' }));
    await expect(new LlmClient({ driver }).completeStructured("q", schema, opts)).rejects.toThrow(
      StructuredOutputError,
    );
  });

  it("surfaces refusals as a typed error", async () => {
    const { driver } = fakeDriver(() => ({ stopReason: "refusal", refusal: "cyber" }));
    await expect(new LlmClient({ driver }).completeStructured("q", schema, opts)).rejects.toThrow(
      LlmRefusalError,
    );
  });
});

describe("toolLoop", () => {
  const lookup = {
    spec: {
      name: "lookup",
      description: "Look up a user",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "integer" } } },
    },
    run: async (input: unknown) => `user ${(input as { id: number }).id}`,
  };

  it("runs tools, feeds results back, and stops when the model is done", async () => {
    const { driver, requests } = fakeDriver((_r, i) =>
      i === 0
        ? {
            stopReason: "tool_use",
            message: {
              role: "assistant",
              parts: [{ type: "tool_call", id: "t1", name: "lookup", input: { id: 7 } }],
            },
          }
        : { text: "done" },
    );
    const r = await new LlmClient({ driver }).toolLoop(
      {
        messages: [{ role: "user", parts: [{ type: "text", text: "go" }] }],
        tools: [lookup],
        maxSteps: 5,
      },
      opts,
    );
    expect(r).toMatchObject({ text: "done", steps: 2, stopReason: "end" });
    expect(requests[1]!.messages.at(-1)!.parts[0]).toEqual({
      type: "tool_result",
      toolCallId: "t1",
      content: "user 7",
    });
  });

  it("rejects invalid tool input without running the tool", async () => {
    let ran = false;
    const tool = { ...lookup, run: async () => ((ran = true), "x") };
    const { driver, requests } = fakeDriver((_r, i) =>
      i === 0
        ? {
            stopReason: "tool_use",
            message: {
              role: "assistant",
              parts: [{ type: "tool_call", id: "t1", name: "lookup", input: { id: "1 OR 1=1" } }],
            },
          }
        : { text: "ok" },
    );
    await new LlmClient({ driver }).toolLoop({ messages: [], tools: [tool], maxSteps: 3 }, opts);
    expect(ran).toBe(false);
    expect(requests[1]!.messages.at(-1)!.parts[0]).toMatchObject({ isError: true });
  });

  it("stops at maxSteps", async () => {
    const { driver } = fakeDriver(() => ({
      stopReason: "tool_use",
      message: {
        role: "assistant",
        parts: [{ type: "tool_call", id: "t", name: "lookup", input: { id: 1 } }],
      },
    }));
    const r = await new LlmClient({ driver }).toolLoop(
      { messages: [], tools: [lookup], maxSteps: 3 },
      opts,
    );
    expect(r).toMatchObject({ steps: 3, stopReason: "max_steps" });
  });
});
