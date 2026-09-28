import { describe, expect, it } from "vitest";
import {
  assertSolanaAddress,
  isValidHandle,
  isValidSolanaAddress,
  normalizeHandle,
} from "../src/utils/solana-address";

describe("solana address validation", () => {
  it("accepts valid base58 32-byte addresses", () => {
    expect(isValidSolanaAddress("So11111111111111111111111111111111111111112")).toBe(true);
    expect(isValidSolanaAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(isValidSolanaAddress("")).toBe(false);
    expect(isValidSolanaAddress("not-an-address")).toBe(false);
    expect(isValidSolanaAddress("0x1234")).toBe(false); // 0 and x not base58 / wrong len
    expect(isValidSolanaAddress("IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII")).toBe(false); // I not in alphabet
    expect(isValidSolanaAddress(12345)).toBe(false);
    expect(isValidSolanaAddress(null)).toBe(false);
  });

  it("assertSolanaAddress throws on invalid", () => {
    expect(() => assertSolanaAddress("bad")).toThrow();
    expect(assertSolanaAddress("So11111111111111111111111111111111111111112")).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });

  it("normalizes and validates handles", () => {
    expect(normalizeHandle("@Alice")).toBe("alice");
    expect(isValidHandle("@bob_99")).toBe(true);
    expect(isValidHandle("has spaces")).toBe(false);
    expect(isValidHandle("")).toBe(false);
  });
});
