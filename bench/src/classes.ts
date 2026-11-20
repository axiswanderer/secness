/**
 * Vulnerability classes SecNess Bench plants (section 0.2). `cwes` lists every CWE a
 * finding may carry and still count as this class: tools label the same bug differently.
 */
export const VULN_CLASSES = {
  sqli: { name: "SQL injection", cwes: ["CWE-89"] },
  nosqli: { name: "NoSQL injection", cwes: ["CWE-943", "CWE-89"] },
  bola: {
    name: "Broken object-level authorization (IDOR)",
    cwes: ["CWE-639", "CWE-284", "CWE-863", "CWE-862"],
  },
  bfla: {
    name: "Broken function-level authorization",
    cwes: ["CWE-285", "CWE-284", "CWE-862", "CWE-863"],
  },
  "jwt-misconfig": {
    name: "JWT misconfiguration (alg none, weak secret)",
    cwes: ["CWE-347", "CWE-345", "CWE-1391", "CWE-521", "CWE-327"],
  },
  "mass-assignment": { name: "Mass assignment", cwes: ["CWE-915", "CWE-269"] },
  ssrf: { name: "Server-side request forgery", cwes: ["CWE-918"] },
  "path-traversal": { name: "Path traversal", cwes: ["CWE-22", "CWE-23", "CWE-73"] },
  "stored-xss": { name: "Stored cross-site scripting", cwes: ["CWE-79", "CWE-80"] },
  "hardcoded-secret": { name: "Hardcoded secret", cwes: ["CWE-798", "CWE-259", "CWE-321"] },
  "vulnerable-dependency": {
    name: "Vulnerable dependency",
    cwes: ["CWE-1395", "CWE-1104", "CWE-937"],
  },
  "missing-rate-limit": {
    name: "Missing rate limit on login",
    cwes: ["CWE-307", "CWE-770", "CWE-799"],
  },
  "cors-misconfig": { name: "Open CORS with credentials", cwes: ["CWE-942", "CWE-346"] },
  "verbose-errors": { name: "Verbose error leakage", cwes: ["CWE-209", "CWE-200", "CWE-497"] },
  // Stage 2 adds business-logic classes (workflow bypass, price tampering, ...).
  "business-logic": {
    name: "Business-logic flaw",
    cwes: ["CWE-840", "CWE-841", "CWE-639", "CWE-20"],
  },
} as const satisfies Record<string, { name: string; cwes: readonly string[] }>;

export type VulnClass = keyof typeof VULN_CLASSES;

/** The 14 classes section 0.2 requires the bench to cover at least once. */
export const REQUIRED_CLASSES: readonly VulnClass[] = (
  Object.keys(VULN_CLASSES) as VulnClass[]
).filter((c) => c !== "business-logic");
