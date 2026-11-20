import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import { CONTRACT_FILES, SCHEMA_BASE_URI, loadSchemas, type ContractName } from "./schemas.js";
import type {
  ChangeEvent,
  Finding,
  GateResult,
  Run,
  TargetProfile,
  TestPlan,
  Verdict,
} from "./generated/types.js";

// ajv-formats is CommonJS; under NodeNext its callable export is on `.default`.
const addFormats = addFormatsModule.default;

export interface ContractTypes {
  ChangeEvent: ChangeEvent;
  TargetProfile: TargetProfile;
  TestPlan: TestPlan;
  Finding: Finding;
  Run: Run;
  GateResult: GateResult;
  Verdict: Verdict;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export class ContractValidationError extends Error {
  constructor(
    readonly contract: ContractName,
    readonly errors: string[],
  ) {
    super(`Invalid ${contract}: ${errors.join("; ")}`);
    this.name = "ContractValidationError";
  }
}

let ajv: Ajv2020 | undefined;
const compiled = new Map<ContractName, ValidateFunction>();

function getAjv(): Ajv2020 {
  if (!ajv) {
    // Tolerant reader: unknown properties are accepted (see packages/schema/README.md).
    ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
    addFormats(ajv);
    for (const schema of Object.values(loadSchemas())) ajv.addSchema(schema);
  }
  return ajv;
}

function formatError(e: ErrorObject): string {
  return `${e.instancePath || "/"} ${e.message ?? "is invalid"}`;
}

export function validate<N extends ContractName>(
  contract: N,
  value: unknown,
): ValidationResult<ContractTypes[N]> {
  let fn = compiled.get(contract);
  if (!fn) {
    fn = getAjv().getSchema(SCHEMA_BASE_URI + CONTRACT_FILES[contract]);
    if (!fn) throw new Error(`schema not loaded: ${contract}`);
    compiled.set(contract, fn);
  }
  if (fn(value)) return { ok: true, value: value as ContractTypes[N] };
  return { ok: false, errors: (fn.errors ?? []).map(formatError) };
}

export function assertValid<N extends ContractName>(contract: N, value: unknown): ContractTypes[N] {
  const r = validate(contract, value);
  if (!r.ok) throw new ContractValidationError(contract, r.errors);
  return r.value;
}
