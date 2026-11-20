import { randomBytes } from "node:crypto";

/** Every generated value carries this marker so leaked fakes are recognisable in evidence. */
export const FAKE_PREFIX = "secness-fake-";

const SECRETISH = /(SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|SALT|PRIVATE|CREDENTIAL|SIGNING)/i;

export interface FakeSecretOptions {
  /** Explicit values for non-secret config (e.g. DATABASE_URL pointing at the sandbox DB). */
  overrides?: Record<string, string>;
}

/**
 * Generates values for every env var the app requires. Values are always fresh fakes.
 * This function deliberately has no access path to the developer's .env or process.env.
 */
export function generateFakeEnv(
  required: readonly string[],
  opts: FakeSecretOptions = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of required) {
    if (opts.overrides && name in opts.overrides) {
      env[name] = opts.overrides[name]!;
    } else if (SECRETISH.test(name)) {
      env[name] = FAKE_PREFIX + randomBytes(24).toString("hex");
    } else {
      env[name] = FAKE_PREFIX + name.toLowerCase();
    }
  }
  return env;
}

export function fakePassword(): string {
  return FAKE_PREFIX + randomBytes(18).toString("base64url");
}

/**
 * Defence in depth: refuse a sandbox env whose values match the host's environment.
 * Catches a future code path that passes process.env (or a parsed .env) through by mistake.
 */
export function assertNoHostSecrets(
  env: Record<string, string>,
  hostEnv: NodeJS.ProcessEnv = process.env,
): void {
  const hostValues = new Set(
    Object.values(hostEnv).filter((v): v is string => typeof v === "string" && v.length >= 8),
  );
  const leaked = Object.entries(env)
    .filter(([, v]) => hostValues.has(v))
    .map(([k]) => k);
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to pass host environment values into the sandbox: ${leaked.join(", ")}`,
    );
  }
}
