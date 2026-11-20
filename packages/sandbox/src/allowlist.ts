/**
 * Target allowlist for scanners and (Stage 2) the AI pentest agent. Enforced in code,
 * never in a prompt: a URL is allowed only if its host is exactly one of the run's own
 * sandbox service hostnames.
 */
export class TargetAllowlist {
  private readonly hosts: ReadonlySet<string>;

  constructor(hostnames: Iterable<string>) {
    const set = new Set<string>();
    for (const h of hostnames) {
      const n = h.toLowerCase();
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(n)) {
        throw new Error(`allowlist entries must be bare sandbox hostnames, got "${h}"`);
      }
      set.add(n);
    }
    this.hosts = set;
  }

  get hostnames(): string[] {
    return [...this.hosts];
  }

  /** Returns the parsed URL if allowed, otherwise null. */
  check(raw: string): URL | null {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    // URL normalises case and IDNA; a trailing dot or any dot means it is not a bare service name.
    return this.hosts.has(url.hostname) ? url : null;
  }

  isAllowed(raw: string): boolean {
    return this.check(raw) !== null;
  }
}
