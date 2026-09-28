import { ValidationError } from "./errors";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_INDEX[BASE58_ALPHABET[i]!] = i;
}

/** Decode a base58 string into bytes, or return null if invalid. */
export function base58Decode(input: string): Uint8Array | null {
  if (input.length === 0) return null;
  const bytes: number[] = [0];
  for (const ch of input) {
    const value = BASE58_INDEX[ch];
    if (value === undefined) return null;
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // account for leading zeros
  for (let k = 0; k < input.length && input[k] === "1"; k++) {
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/**
 * A Solana address is a base58-encoded ed25519 public key of exactly 32 bytes.
 * This validates encoding + byte length without asserting on-curve membership
 * (PDAs are valid off-curve addresses).
 */
export function isValidSolanaAddress(address: unknown): address is string {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  const decoded = base58Decode(trimmed);
  return decoded !== null && decoded.length === 32;
}

export function assertSolanaAddress(address: unknown): string {
  if (!isValidSolanaAddress(address)) {
    throw new ValidationError(`Invalid Solana address: ${String(address).slice(0, 64)}`);
  }
  return (address as string).trim();
}

/** Normalize a FOMO/X handle: strip a leading @, lowercase, trim. */
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidHandle(handle: unknown): handle is string {
  if (typeof handle !== "string") return false;
  const h = normalizeHandle(handle);
  return /^[a-z0-9_]{1,30}$/.test(h);
}
