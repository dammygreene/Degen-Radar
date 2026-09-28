import { describe, expect, it } from "vitest";
import { evaluateCooldown, inQuietHours, type AlertRecord } from "../src/domain/alerts/cooldown";

const cfg = { tokenCooldownSeconds: 900, maxAlertsPerHour: 5 };
const now = new Date("2026-01-01T12:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe("cooldown / anti-spam", () => {
  it("allows a first alert", () => {
    const d = evaluateCooldown([], { userId: "u1", tokenAddress: "T1" }, cfg, now);
    expect(d.allowed).toBe(true);
  });

  it("blocks the same token within cooldown", () => {
    const recent: AlertRecord[] = [{ userId: "u1", tokenAddress: "T1", sentAt: ago(300) }];
    const d = evaluateCooldown(recent, { userId: "u1", tokenAddress: "T1" }, cfg, now);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("cooldown");
  });

  it("allows same token after cooldown elapses", () => {
    const recent: AlertRecord[] = [{ userId: "u1", tokenAddress: "T1", sentAt: ago(1000) }];
    const d = evaluateCooldown(recent, { userId: "u1", tokenAddress: "T1" }, cfg, now);
    expect(d.allowed).toBe(true);
  });

  it("enforces per-hour cap", () => {
    const recent: AlertRecord[] = Array.from({ length: 5 }, (_, i) => ({
      userId: "u1",
      tokenAddress: `T${i}`,
      sentAt: ago(60 * (i + 1)),
    }));
    const d = evaluateCooldown(recent, { userId: "u1", tokenAddress: "T99" }, cfg, now);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("hourly");
  });

  it("scopes limits per user", () => {
    const recent: AlertRecord[] = Array.from({ length: 5 }, (_, i) => ({
      userId: "u1",
      tokenAddress: `T${i}`,
      sentAt: ago(60 * (i + 1)),
    }));
    const d = evaluateCooldown(recent, { userId: "u2", tokenAddress: "T99" }, cfg, now);
    expect(d.allowed).toBe(true);
  });
});

describe("quiet hours", () => {
  it("returns false when disabled", () => {
    expect(inQuietHours(null, now)).toBe(false);
  });
  it("detects a normal window", () => {
    expect(inQuietHours({ startHourUtc: 9, endHourUtc: 17 }, new Date("2026-01-01T12:00:00Z"))).toBe(true);
    expect(inQuietHours({ startHourUtc: 9, endHourUtc: 17 }, new Date("2026-01-01T20:00:00Z"))).toBe(false);
  });
  it("handles windows that wrap midnight", () => {
    expect(inQuietHours({ startHourUtc: 22, endHourUtc: 6 }, new Date("2026-01-01T23:00:00Z"))).toBe(true);
    expect(inQuietHours({ startHourUtc: 22, endHourUtc: 6 }, new Date("2026-01-01T03:00:00Z"))).toBe(true);
    expect(inQuietHours({ startHourUtc: 22, endHourUtc: 6 }, new Date("2026-01-01T12:00:00Z"))).toBe(false);
  });
});
