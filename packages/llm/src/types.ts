/**
 * Provider-neutral message model. Drivers translate to and from their SDK's shapes.
 * Nothing outside packages/llm imports a provider SDK.
 */

export type Part =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface Message {
  role: "user" | "assistant";
  parts: Part[];
  /**
   * The provider's original content for an assistant turn. Drivers send it back unchanged
   * on the next turn (required for e.g. Anthropic thinking blocks). Ignored by other providers.
   */
  providerRaw?: { provider: string; content: unknown };
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (object) for the tool input. */
  inputSchema: Record<string, unknown>;
}

export interface TurnRequest {
  model?: string;
  system?: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxOutputTokens: number;
  /** Ask the provider to constrain output to this JSON Schema. Output is still validated locally. */
  responseSchema?: Record<string, unknown>;
}

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface TurnResult {
  message: Message;
  stopReason: StopReason;
  usage: Usage;
  /** The model that actually served the request (may differ from the one requested, e.g. on fallback). */
  model: string;
  /** Provider's refusal explanation, when stopReason is "refusal". */
  refusal?: string;
}

/** One provider. A driver makes exactly one model call per turn() and does no metering. */
export interface LlmDriver {
  readonly provider: string;
  readonly defaultModel: string;
  turn(req: TurnRequest): Promise<TurnResult>;
}

export function textOf(message: Message): string {
  return message.parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}
