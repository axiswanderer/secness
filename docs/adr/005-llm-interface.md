# ADR-005: One provider-agnostic LLM interface with metering, a hard spend cap and consent

- Status: accepted
- Date: 2026-11-17

## Context

Harness-agnostic means model-agnostic too. LLM spend must not exceed revenue per run, and
customer source code must never reach an LLM without consent.

## Decision

- `LlmClient` (`packages/llm`) is the only LLM entry point: `complete`, `completeStructured(schema)`
  and `toolLoop`. Provider SDKs are imported only by drivers.
- Drivers: Anthropic (default model `claude-opus-5-5`, effort set explicitly, server-side refusal
  fallback on) and OpenAI (model and price must be configured).
- Every call records provider, model, tokens, cost and latency (`LlmCallRecord`) on the Run.
- A hard per-run cap (`SpendBudget`, default USD 1). Before each call the worst-case input cost is
  bounded (byte-level BPE: tokens never exceed UTF-8 bytes) and output tokens are clamped to what
  is left. A model with no known price is refused, because its cost cannot be bounded.
- A call that includes source code is refused unless the user opted in during `secness init`.
- Structured outputs and tool inputs are always validated locally, whatever the provider promises.

## Consequences

Adding a provider means one driver and a price entry. Bedrock, Vertex and self-hosted endpoints
(Stage 5) fit the same interface.
