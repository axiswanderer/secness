import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { AnthropicDriver } from "../src/drivers/anthropic.js";
import { OpenAiDriver } from "../src/drivers/openai.js";
import type { Message } from "../src/types.js";

describe("AnthropicDriver", () => {
  function stub(response: Record<string, unknown>) {
    const calls: Record<string, unknown>[] = [];
    const client = {
      beta: {
        messages: { create: async (p: Record<string, unknown>) => (calls.push(p), response) },
      },
    } as unknown as Anthropic;
    return { client, calls };
  }
  const thinking = { type: "thinking", thinking: "", signature: "sig" };
  const toolUse = { type: "tool_use", id: "tu_1", name: "lookup", input: { id: 1 } };
  const response = {
    model: "claude-opus-5-5",
    content: [thinking, { type: "text", text: "checking" }, toolUse],
    stop_reason: "tool_use",
    stop_details: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 2,
      cache_creation_input_tokens: null,
    },
  };

  it("sends model, effort, refusal fallback and structured output config", async () => {
    const { client, calls } = stub(response);
    await new AnthropicDriver({ client }).turn({
      messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
      maxOutputTokens: 1000,
      responseSchema: { type: "object" },
    });
    expect(calls[0]).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 1000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: { type: "object" } },
      },
    });
    expect(calls[0]).not.toHaveProperty("thinking"); // Opus 5.5 runs adaptive by default
  });

  it("maps the response and preserves raw content, thinking blocks included, for the next turn", async () => {
    const { client, calls } = stub(response);
    const d = new AnthropicDriver({ client });
    const r = await d.turn({ messages: [], maxOutputTokens: 100 });
    expect(r.stopReason).toBe("tool_use");
    expect(r.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 2,
      cacheWriteTokens: 0,
    });
    expect(r.message.parts).toEqual([
      { type: "text", text: "checking" },
      { type: "tool_call", id: "tu_1", name: "lookup", input: { id: 1 } },
    ]);
    const next: Message = {
      role: "user",
      parts: [{ type: "tool_result", toolCallId: "tu_1", content: "ok" }],
    };
    await d.turn({ messages: [r.message, next], maxOutputTokens: 100 });
    const sent = (calls[1] as { messages: { content: unknown }[] }).messages;
    expect(sent[0]!.content).toEqual(response.content);
    expect(sent[1]!.content).toEqual([{ type: "tool_result", tool_use_id: "tu_1", content: "ok" }]);
  });

  it("can disable the refusal fallback", async () => {
    const { client, calls } = stub({ ...response, stop_reason: "end_turn" });
    await new AnthropicDriver({ client, refusalFallback: false }).turn({
      messages: [],
      maxOutputTokens: 1,
    });
    expect(calls[0]).not.toHaveProperty("fallbacks");
  });

  it("maps refusals with their explanation", async () => {
    const { client } = stub({
      ...response,
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: "declined" },
    });
    const r = await new AnthropicDriver({ client }).turn({ messages: [], maxOutputTokens: 1 });
    expect(r).toMatchObject({ stopReason: "refusal", refusal: "declined" });
  });
});

describe("OpenAiDriver", () => {
  it("maps tools, tool results and usage", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      chat: {
        completions: {
          create: async (p: Record<string, unknown>) => (
            calls.push(p),
            {
              model: "gpt-x",
              choices: [
                {
                  finish_reason: "tool_calls",
                  message: {
                    content: null,
                    refusal: null,
                    tool_calls: [
                      {
                        id: "c1",
                        type: "function",
                        function: { name: "lookup", arguments: '{"id":3}' },
                      },
                    ],
                  },
                },
              ],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                prompt_tokens_details: { cached_tokens: 40 },
              },
            }
          ),
        },
      },
    } as unknown as OpenAI;
    const d = new OpenAiDriver({ client, model: "gpt-x" });
    const r = await d.turn({
      system: "sys",
      messages: [
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "c0", name: "lookup", input: { id: 1 } }],
        },
        {
          role: "user",
          parts: [{ type: "tool_result", toolCallId: "c0", content: "boom", isError: true }],
        },
      ],
      tools: [{ name: "lookup", description: "d", inputSchema: { type: "object" } }],
      maxOutputTokens: 50,
    });
    expect(r.stopReason).toBe("tool_use");
    expect(r.message.parts).toEqual([
      { type: "tool_call", id: "c1", name: "lookup", input: { id: 3 } },
    ]);
    expect(r.usage).toEqual({
      inputTokens: 60,
      outputTokens: 20,
      cacheReadTokens: 40,
      cacheWriteTokens: 0,
    });
    expect(calls[0]).toMatchObject({
      max_completion_tokens: 50,
      messages: [
        { role: "system", content: "sys" },
        {
          role: "assistant",
          tool_calls: [{ id: "c0", function: { name: "lookup", arguments: '{"id":1}' } }],
        },
        { role: "tool", tool_call_id: "c0", content: "ERROR: boom" },
      ],
    });
  });
});
