/** Canonical v1 examples, adapted from section 3 of the architecture plan. */
import type {
  ChangeEvent,
  Finding,
  GateResult,
  Run,
  TargetProfile,
  TestPlan,
  Verdict,
} from "../../src/generated/types.js";

export const RUN = "run_01HZY3Q8K2M4N6P8R0T2V4X6Z8";
export const FND = "fnd_01HZY3Q8K2M4N6P8R0T2V4X6Z9";
export const CHG = "chg_01HZY3Q8K2M4N6P8R0T2V4X6Z7";

export const changeEvent: ChangeEvent = {
  id: CHG,
  source: "claude-code",
  trigger: "agent_turn_end",
  repo_root: "/home/dev/app",
  base_ref: "4f2a9c1",
  head_ref: "worktree:7d1e",
  changed_files: [{ path: "src/routes/users.ts", status: "modified" }],
  session_ref: "sess_abc",
  created_at: "2026-11-17T12:00:00Z",
};

export const targetProfile: TargetProfile = {
  stack: { language: "typescript", framework: "express", frontend: "react", db: "postgres" },
  build: { strategy: "compose", file: "docker-compose.yml" },
  services: [{ name: "api", port: 3000, health: "/health" }],
  env: { required: ["DATABASE_URL", "JWT_SECRET"], generated: true },
  api_surface: {
    openapi: null,
    routes: [
      {
        method: "GET",
        path: "/api/users/:id/profile",
        file: "src/routes/users.ts",
        auth: "bearer",
      },
    ],
  },
  auth: { type: "jwt", login: { method: "POST", path: "/api/login" }, roles: ["user", "admin"] },
  seed: {
    users: [
      { role: "user", count: 2 },
      { role: "admin", count: 1 },
    ],
  },
};

export const testPlan: TestPlan = {
  run_id: RUN,
  mode: "incremental",
  static: [{ engine: "semgrep", rulesets: ["secness/express"], paths: ["src/routes/users.ts"] }],
  dynamic: [{ suite: "access-control.bola", targets: ["GET /api/users/:id/profile"] }],
  ai_agent: { enabled: false, budget: { max_steps: 0, max_usd: 0 } },
  timeout_s: 300,
};

export const finding: Finding = {
  id: FND,
  fingerprint: "sha256:" + "a".repeat(64),
  status: "confirmed",
  title: "Broken object-level authorization on user profile",
  class: { cwe: "CWE-639", owasp: "API1:2023" },
  severity: { level: "high", cvss: 8.1, rationale: "Any user can read any profile" },
  confidence: "proven",
  location: {
    file: "src/routes/users.ts",
    line_start: 42,
    line_end: 51,
    endpoint: "GET /api/users/:id/profile",
  },
  evidence: {
    request: "GET /api/users/103/profile HTTP/1.1\r\nAuthorization: Bearer eyJh…",
    response_excerpt: 'HTTP/1.1 200 OK\r\n\r\n{"email":"bob@…"}',
    replay: `evidence/${FND}/replay.http`,
    logs: `evidence/${FND}/app.log`,
  },
  reproduction: [
    "Log in as seed user A (id 102)",
    "GET /api/users/103/profile with A's token",
    "Observe 200 with user B's email",
  ],
  remediation: {
    summary: "Check that req.user.id matches :id or that caller is admin",
    patch_hint: null,
    references: ["OWASP API1:2023"],
  },
  regression_test: { framework: "jest+supertest", code: "test('...', async () => {})" },
  detected_by: ["dynamic.access-control.bola"],
  first_seen_run: RUN,
  last_seen_run: RUN,
};

export const gateResult: GateResult = {
  policy: "default@1",
  passed: false,
  blocking: [FND],
  counts: { critical: 0, high: 1, medium: 2, low: 0, info: 0, accepted: 1 },
  coverage: {
    routes_tested: 41,
    routes_total: 44,
    suites: ["auth", "injection", "access-control"],
  },
  score: 82,
};

export const run: Run = {
  id: RUN,
  change_event_id: CHG,
  mode: "incremental",
  state: "done",
  timings: [
    { state: "queued", started_at: "2026-11-17T12:00:00Z", ended_at: "2026-11-17T12:00:01Z" },
    { state: "done", started_at: "2026-11-17T12:02:30Z", ended_at: null },
  ],
  finding_ids: [FND],
  gate_result: gateResult,
  error: null,
  llm_calls: [
    {
      provider: "anthropic",
      model: "claude-opus-5-5",
      purpose: "feedback-composer",
      input_tokens: 1200,
      output_tokens: 300,
      cost_usd: 0.0108,
      latency_ms: 2100,
      at: "2026-11-17T12:02:00Z",
    },
  ],
  created_at: "2026-11-17T12:00:00Z",
};

export const verdict: Verdict = {
  finding_id: FND,
  run_id: RUN,
  verdict: "fixed",
  reason: "Replay returned 403; health check passed.",
  replay_response_excerpt: "HTTP/1.1 403 Forbidden",
  checked_at: "2026-11-17T12:10:00Z",
};
