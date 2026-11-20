/* eslint-disable */
/**
 * GENERATED FILE — do not edit. Source: packages/schema/schemas/v1.
 * Regenerate with `pnpm schema:gen`.
 */

export type ChangeEventId = string;
/**
 * Path relative to the repo root, '/'-separated. Never absolute, never escapes the root.
 */
export type RepoPath = string;
/**
 * RFC 3339 timestamp.
 */
export type Timestamp = string;
export type FindingId = string;
/**
 * This interface was referenced by `Finding`'s JSON-Schema
 * via the `definition` "FindingStatus".
 */
export type FindingStatus =
  | "candidate"
  | "confirmed"
  | "sent"
  | "fix_proposed"
  | "verified_fixed"
  | "reopened"
  | "accepted_risk"
  | "false_positive";
export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";
/**
 * proven: reproduced by replay + oracle. likely: corroborated by a second signal. unverified: single unconfirmed signal.
 */
export type Confidence = "proven" | "likely" | "unverified";
/**
 * 'METHOD /path' with framework-style params, e.g. 'GET /api/users/:id/profile'.
 */
export type Endpoint = string;
export type RunId = string;
export type RunMode = "incremental" | "full" | "verify";
/**
 * This interface was referenced by `Run`'s JSON-Schema
 * via the `definition` "RunState".
 */
export type RunState =
  "queued" | "profiling" | "building" | "scanning" | "validating" | "reporting" | "done" | "failed";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Emitted by a harness adapter (C1) when a coding agent finishes a change.
 */
export interface ChangeEvent {
  id: ChangeEventId;
  source: "claude-code" | "codex" | "cursor" | "git-hook" | "ci" | "manual";
  trigger: "agent_turn_end" | "commit" | "build" | "manual";
  /**
   * Absolute path of the repository root.
   */
  repo_root: string;
  /**
   * Git sha or snapshot id the change is measured from. null on the first run of a repo.
   */
  base_ref: string | null;
  /**
   * Git sha or working-tree snapshot id.
   */
  head_ref: string;
  changed_files: ChangedFile[];
  /**
   * Harness session id, used to route findings back to the right agent session.
   */
  session_ref?: string | null;
  created_at: Timestamp;
}
/**
 * old_path is set when status is renamed.
 */
export interface ChangedFile {
  path: RepoPath;
  status: "added" | "modified" | "deleted" | "renamed";
  old_path?: RepoPath;
}
/**
 * A security finding. This is what the coding agent receives. Only C10 verification may set status to verified_fixed.
 */
export interface Finding {
  id: FindingId;
  /**
   * sha256(rule + normalized location + sink). Stable across runs and tools; the dedupe key.
   */
  fingerprint: string;
  status: FindingStatus;
  title: string;
  class: FindingClass;
  severity: Severity;
  confidence: Confidence;
  location: FindingLocation;
  evidence: Evidence;
  reproduction: string[];
  remediation: Remediation;
  regression_test?: RegressionTest | null;
  /**
   * @minItems 1
   */
  detected_by: [string, ...string[]];
  first_seen_run: RunId;
  last_seen_run: RunId;
  dismissal?: Dismissal | null;
}
export interface FindingClass {
  cwe: string;
  owasp?: string | null;
}
export interface Severity {
  level: SeverityLevel;
  cvss?: number | null;
  rationale: string;
}
export interface FindingLocation {
  file: RepoPath;
  line_start?: number | null;
  line_end?: number | null;
  endpoint?: Endpoint | null;
}
/**
 * Dynamic findings carry request/response/replay. Static-only findings may have none, and are then at most 'likely'.
 */
export interface Evidence {
  /**
   * Raw HTTP request, secrets redacted.
   */
  request?: string | null;
  /**
   * Redacted raw HTTP response excerpt.
   */
  response_excerpt?: string | null;
  /**
   * Evidence-store path to the replay script (.http).
   */
  replay?: string | null;
  /**
   * Evidence-store path to app logs.
   */
  logs?: string | null;
  /**
   * Source excerpt for static findings.
   */
  snippet?: string | null;
}
export interface Remediation {
  summary: string;
  /**
   * Optional unified diff, verified in a throwaway sandbox (Stage 2+).
   */
  patch_hint?: string | null;
  references?: string[];
}
export interface RegressionTest {
  framework: string;
  code: string;
}
/**
 * Set only by a human via a signed CLI token (secness_dismiss). Never by an agent.
 */
export interface Dismissal {
  reason: string;
  by: string;
  at: Timestamp;
  expires_at?: Timestamp | null;
}
/**
 * The pass/fail decision for a run. A gate passing means a defined bar was met on the listed coverage, never 'zero vulnerabilities'.
 */
export interface GateResult {
  policy: string;
  passed: boolean;
  blocking: FindingId[];
  /**
   * Human-readable reasons the gate failed that are not findings, e.g. 'app could not start'.
   */
  reasons?: string[];
  counts: GateCounts;
  coverage: GateCoverage;
  score: number;
}
export interface GateCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  accepted: number;
}
export interface GateCoverage {
  routes_tested: number;
  routes_total: number;
  suites: string[];
}
/**
 * One execution of the SecNess loop.
 */
export interface Run {
  id: RunId;
  /**
   * null for scheduled or manual full runs with no triggering change.
   */
  change_event_id: ChangeEventId | null;
  mode: RunMode;
  state: RunState;
  /**
   * One entry per state entered, in order.
   */
  timings: StateTiming[];
  finding_ids: FindingId[];
  gate_result: GateResult | null;
  error?: RunError | null;
  /**
   * Every LLM call made during the run (section 0.4).
   */
  llm_calls?: LlmCallRecord[];
  created_at: Timestamp;
}
export interface StateTiming {
  state: RunState;
  started_at: Timestamp;
  ended_at: Timestamp | null;
}
export interface RunError {
  code: string;
  message: string;
}
/**
 * This interface was referenced by `Run`'s JSON-Schema
 * via the `definition` "LlmCallRecord".
 */
export interface LlmCallRecord {
  provider: string;
  model: string;
  /**
   * What the call was for, e.g. 'feedback-composer'.
   */
  purpose?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cost_usd: number;
  latency_ms: number;
  at: Timestamp;
}
/**
 * Produced by the target profiler (C4). Cached per repo; refreshed when build or route files change.
 */
export interface TargetProfile {
  generated_at?: Timestamp;
  /**
   * Hash of the build and route files the profile was derived from. A mismatch means the cache is stale.
   */
  inputs_hash?: string;
  stack: Stack;
  build: BuildRecipe;
  /**
   * @minItems 1
   */
  services: [ServiceSpec, ...ServiceSpec[]];
  env: EnvSpec;
  api_surface: ApiSurface;
  auth: AuthSpec;
  seed: SeedPlan;
}
export interface Stack {
  language: string;
  framework: string;
  frontend?: string | null;
  db?: string | null;
}
export interface BuildRecipe {
  strategy: "dockerfile" | "compose" | "buildpack" | "generated";
  file: RepoPath | null;
}
export interface ServiceSpec {
  name: string;
  port: number;
  /**
   * Health check path, e.g. /health. null means probe / for any 2xx/4xx.
   */
  health?: string | null;
}
export interface EnvSpec {
  required: string[];
  /**
   * Always true in v1: sandbox env values are generated fakes, never read from the developer's .env.
   */
  generated: boolean;
}
export interface ApiSurface {
  openapi: RepoPath | null;
  routes: Route[];
}
export interface Route {
  method: HttpMethod;
  path: string;
  file?: RepoPath;
  line?: number;
  auth: "bearer" | "cookie" | "none" | "unknown";
  middleware?: string[];
}
export interface AuthSpec {
  type: "jwt" | "session" | "none" | "unknown";
  login: RouteRef | null;
  register?: RouteRef | null;
  roles: string[];
}
/**
 * This interface was referenced by `TargetProfile`'s JSON-Schema
 * via the `definition` "RouteRef".
 */
export interface RouteRef {
  method: HttpMethod;
  path: string;
}
export interface SeedPlan {
  users: SeedUsers[];
}
export interface SeedUsers {
  role: string;
  count: number;
}
/**
 * Produced by change intelligence (C3): which engines and suites run for a change.
 */
export interface TestPlan {
  run_id: RunId;
  mode: RunMode;
  static: StaticTask[];
  dynamic: DynamicTask[];
  ai_agent: AiAgentTask;
  timeout_s: number;
}
export interface StaticTask {
  engine: "semgrep" | "gitleaks" | "trivy" | "osv-scanner" | "trivy-config";
  rulesets?: string[];
  /**
   * Empty array means the whole tree (full mode).
   */
  paths: RepoPath[];
}
export interface DynamicTask {
  suite: string;
  /**
   * Empty array means every route in the profile.
   */
  targets: Endpoint[];
}
export interface AiAgentTask {
  enabled: boolean;
  budget: AiAgentBudget;
}
export interface AiAgentBudget {
  max_steps: number;
  max_usd: number;
}
/**
 * Result of replaying one finding against patched code (secness_verify).
 */
export interface Verdict {
  finding_id: FindingId;
  run_id: RunId;
  /**
   * fixed: attack fails and app is healthy. regressed: the fix broke the route (5xx or health failure).
   */
  verdict: "fixed" | "not_fixed" | "regressed" | "inconclusive";
  reason: string;
  replay_response_excerpt?: string | null;
  checked_at: Timestamp;
}
