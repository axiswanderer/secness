import { randomBytes } from "node:crypto";

/** Crockford base32, as used by ULID. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type IdPrefix = "chg" | "run" | "fnd";

/** A ULID: 48-bit millisecond timestamp + 80 bits of randomness, 26 chars, sortable by time. */
export function ulid(now: number = Date.now()): string {
  if (!Number.isInteger(now) || now < 0 || now > 2 ** 48 - 1) {
    throw new RangeError(`ulid: timestamp out of range: ${now}`);
  }
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i]! % 32];
  return time + rand;
}

export function newId<P extends IdPrefix>(prefix: P, now?: number): `${P}_${string}` {
  return `${prefix}_${ulid(now)}`;
}

const ID_RE = /^(chg|run|fnd)_[0-9A-HJKMNP-TV-Z]{26}$/;

export function isId(value: unknown, prefix?: IdPrefix): value is string {
  if (typeof value !== "string" || !ID_RE.test(value)) return false;
  return prefix === undefined || value.startsWith(`${prefix}_`);
}
