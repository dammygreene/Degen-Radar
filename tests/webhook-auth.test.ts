import { describe, expect, it } from "vitest";
import { verifyHeliusWebhook } from "../src/providers/helius/adapter";

describe("verifyHeliusWebhook", () => {
  it("accepts a matching secret (constant-time)", () => {
    expect(verifyHeliusWebhook("s3cr3t", "s3cr3t")).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifyHeliusWebhook("s3cr3t", "nope")).toBe(false);
  });
  it("rejects a missing header when a secret is configured", () => {
    expect(verifyHeliusWebhook("s3cr3t", undefined)).toBe(false);
  });
  it("allows missing secret only in dev when opted in", () => {
    expect(verifyHeliusWebhook(undefined, undefined, { allowMissingInDev: true })).toBe(true);
    expect(verifyHeliusWebhook(undefined, undefined)).toBe(false);
  });
});
