import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { LlmDriver, Message, StopReason, TurnRequest, TurnResult } from "../types.js";

export interface OpenAiDriverOptions {
  client?: OpenAI;
  /** Required: SecNess ships no OpenAI default model or price; configure both together. */
  model: string;
}

const PROVIDER = "openai";

export class OpenAiDriver implements LlmDriver {
  readonly provider = PROVIDER;
  readonly defaultModel: string;
  private readonly client: OpenAI;

  constructor(opts: OpenAiDriverOptions) {
    this.client = opts.client ?? new OpenAI();
    this.defaultModel = opts.model;
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const messages: ChatCompletionMessageParam[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    for (const m of req.messages) messages.push(...toOpenAi(m));

    const response = await this.client.chat.completions.create({
      model: req.model ?? this.defaultModel,
      max_completion_tokens: req.maxOutputTokens,
      messages,
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t): ChatCompletionTool => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          }
        : {}),
      ...(req.responseSchema
        ? {
            response_format: {
              type: "json_schema" as const,
              // Non-strict: OpenAI strict mode rejects optional properties. Validated locally instead.
              json_schema: { name: "secness_output", schema: req.responseSchema, strict: false },
            },
          }
        : {}),
    });

    const choice = response.choices[0];
    const parts: Message["parts"] = [];
    if (choice?.message.content) parts.push({ type: "text", text: choice.message.content });
    for (const call of choice?.message.tool_calls ?? []) {
      if (call.type !== "function") continue;
      let input: unknown;
      try {
        input = JSON.parse(call.function.arguments);
      } catch {
        input = { __invalid_json__: call.function.arguments };
      }
      parts.push({ type: "tool_call", id: call.id, name: call.function.name, input });
    }
    const refusal = choice?.message.refusal ?? undefined;
    return {
      message: { role: "assistant", parts },
      stopReason: refusal ? "refusal" : mapStop(choice?.finish_reason),
      usage: {
        inputTokens:
          (response.usage?.prompt_tokens ?? 0) -
          (response.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        outputTokens: response.usage?.completion_tokens ?? 0,
        cacheReadTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheWriteTokens: 0,
      },
      model: response.model,
      ...(refusal ? { refusal } : {}),
    };
  }
}

function toOpenAi(m: Message): ChatCompletionMessageParam[] {
  if (m.role === "assistant") {
    const text = m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
    const calls = m.parts.flatMap((p) =>
      p.type === "tool_call"
        ? [
            {
              id: p.id,
              type: "function" as const,
              function: { name: p.name, arguments: JSON.stringify(p.input) },
            },
          ]
        : [],
    );
    return [
      { role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) },
    ];
  }
  const out: ChatCompletionMessageParam[] = [];
  const text = m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
  for (const p of m.parts) {
    if (p.type === "tool_result") {
      out.push({
        role: "tool",
        tool_call_id: p.toolCallId,
        content: p.isError ? `ERROR: ${p.content}` : p.content,
      });
    }
  }
  if (text) out.push({ role: "user", content: text });
  return out;
}

function mapStop(r: string | null | undefined): StopReason {
  switch (r) {
    case "stop":
      return "end";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}
