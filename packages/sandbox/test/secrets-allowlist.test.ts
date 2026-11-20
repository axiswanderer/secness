import { describe, expect, it } from "vitest";
import { TargetAllowlist } from "../src/allowlist.js";
import { assertNoHostSecrets, FAKE_PREFIX, generateFakeEnv } from "../src/secrets.js";

describe("generateFakeEnv", () => {
  it("generates fresh fakes and honours explicit overrides", () => {
    const a = generateFakeEnv(["JWT_SECRET", "PORT", "DATABASE_URL"], {
      overrides: { DATABASE_URL: "postgres://app:x@db:5432/app" },
    });
    const b = generateFakeEnv(["JWT_SECRET"]);
    expect(a.JWT_SECRET).toMatch(new RegExp(`^${FAKE_PREFIX}[0-9a-f]{48}$`));
    expect(a.JWT_SECRET).not.toBe(b.JWT_SECRET);
    expect(a.DATABASE_URL).toBe("postgres://app:x@db:5432/app");
    expect(a.PORT).toBe(`${FAKE_PREFIX}port`);
  });
});

describe("assertNoHostSecrets", () => {
  it("rejects values copied from the host environment", () => {
    expect(() =>
      assertNoHostSecrets(
        { API_KEY: "sk-real-host-value" },
        { OPENAI_API_KEY: "sk-real-host-value" },
      ),
    ).toThrow(/API_KEY/);
  });
  it("accepts generated values", () => {
    expect(() =>
      assertNoHostSecrets(generateFakeEnv(["X_TOKEN"]), { HOME: "/Users/me" }),
    ).not.toThrow();
  });
});

describe("TargetAllowlist", () => {
  const al = new TargetAllowlist(["api", "web"]);

  it.each(["http://api:3000/users/1", "https://WEB/", "http://api/a?b=c"])("allows %s", (u) => {
    expect(al.isAllowed(u)).toBe(true);
  });

  it.each([
    "http://example.com/",
    "http://api.example.com/",
    "http://api./",
    "http://evil.com@api/",
    "http://api@evil.com/",
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:3000/",
    "http://[::1]/",
    "http://0x7f000001/",
    "file:///etc/passwd",
    "gopher://api/",
    "not a url",
  ])("refuses %s", (u) => {
    expect(al.isAllowed(u)).toBe(false);
  });

  it.each(["10.0.0.1", "api.example.com", "localhost.", ""])("refuses allowlist entry %j", (h) => {
    expect(() => new TargetAllowlist([h])).toThrow();
  });
});
