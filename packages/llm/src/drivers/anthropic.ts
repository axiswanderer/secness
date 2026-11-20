import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaStopReason,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { LlmDriver, Message, StopReason, TurnRequest, TurnResult } from "../types.js";

export interface AnthropicDriverOptions {
  /** Defaults to the SDK's credential resolution (ANTHROPIC_API_KEY, `ant auth login`, ...). */
  client?: Anthropic;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Server-side refusal fallback. SecNess prompts are security work (exploit replay, attack
   * plans), which a safety classifier can occasionally decline; "default" lets the API
   * re-route the same request instead of failing the run. Set false to disable.
   */
  refusalFallback?: boolean;
}

const PROVIDER = "anthropic";

export class AnthropicDriver implements LlmDriver {
  readonly provider = PROVIDER;
  readonly defaultModel: string;
  private readonly client: Anthropic;
  private readonly effort: NonNullable<AnthropicDriverOptions["effort"]>;
  private readonly refusalFallback: boolean;

  constructor(opts: AnthropicDriverOptions = {}) {
    this.client = opts.client ?? new Anthropic();
    this.defaultModel = opts.model ?? "claude-opus-5-5";
    // Opus 5.5 defaults to medium; set it explicitly so behaviour doesn't drift with defaults.
    this.effort = opts.effort ?? "medium";
    this.refusalFallback = opts.refusalFallback ?? true;
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const response = await this.client.beta.messages.create({
      model: req.model ?? this.defaultModel,
      max_tokens: req.maxOutputTokens,
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages.map(toAnthropic),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t): BetaTool => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as BetaTool["input_schema"],
            })),
          }
        : {}),
      output_config: {
        effort: this.effort,
        ...(req.responseSchema
          ? { format: { type: "json_schema" as const, schema: req.responseSchema } }
          : {}),
      },
      ...(this.refusalFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });

    const parts: Message["parts"] = [];
    for (const block of response.content) {
      if (block.type === "text") parts.push({ type: "text", text: block.text });
      else if (block.type === "tool_use") {
        parts.push({ type: "tool_call", id: block.id, name: block.name, input: block.input });
      }
    }
    const refusal =
      response.stop_reason === "refusal"
        ? (response.stop_details?.explanation ?? undefined)
        : undefined;
    return {
      message: {
        role: "assistant",
        parts,
        // Kept verbatim: thinking and fallback blocks must be sent back unchanged.
        providerRaw: { provider: PROVIDER, content: response.content },
      },
      stopReason: mapStop(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
      model: response.model,
      ...(refusal ? { refusal } : {}),
    };
  }
}

function toAnthropic(m: Message): BetaMessageParam {
  if (m.role === "assistant" && m.providerRaw?.provider === PROVIDER) {
    return { role: "assistant", content: m.providerRaw.content as BetaContentBlock[] };
  }
  const content: BetaContentBlockParam[] = m.parts.map((p): BetaContentBlockParam => {
    switch (p.type) {
      case "text":
        return { type: "text", text: p.text };
      case "tool_call":
        return { type: "tool_use", id: p.id, name: p.name, input: p.input };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: p.toolCallId,
          content: p.content,
          ...(p.isError ? { is_error: true } : {}),
        };
    }
  });
  return { role: m.role, content };
}

function mapStop(r: BetaStopReason | null): StopReason {
  switch (r) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}
