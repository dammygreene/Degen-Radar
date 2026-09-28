import { describe, expect, it } from "vitest";
import { PRIORITY_WEIGHT, resolveScanPriority } from "../src/domain/scans/priority";

describe("scan priority", () => {
  it("maps single watched buy to HIGH", () => {
    expect(resolveScanPriority({ reason: "WATCHED_WALLET_BUY" })).toBe("HIGH");
    expect(resolveScanPriority({ reason: "FOMO_BUY" })).toBe("HIGH");
  });

  it("maps 2-entity convergence to HIGH and 3+ to CRITICAL", () => {
    expect(resolveScanPriority({ reason: "CONVERGENCE", independentEntities: 2 })).toBe("HIGH");
    expect(resolveScanPriority({ reason: "CONVERGENCE", independentEntities: 3 })).toBe("CRITICAL");
  });

  it("maps manual/momentum to NORMAL and discovery to LOW", () => {
    expect(resolveScanPriority({ reason: "MANUAL" })).toBe("NORMAL");
    expect(resolveScanPriority({ reason: "MOMENTUM" })).toBe("NORMAL");
    expect(resolveScanPriority({ reason: "DISCOVERY" })).toBe("LOW");
  });

  it("backfill is always LOW; risk change is HIGH", () => {
    expect(resolveScanPriority({ reason: "WATCHED_WALLET_BUY", backfill: true })).toBe("LOW");
    expect(resolveScanPriority({ reason: "MANUAL", riskChange: true })).toBe("HIGH");
  });

  it("critical outranks high in queue weight", () => {
    expect(PRIORITY_WEIGHT.CRITICAL).toBeLessThan(PRIORITY_WEIGHT.HIGH);
    expect(PRIORITY_WEIGHT.HIGH).toBeLessThan(PRIORITY_WEIGHT.NORMAL);
    expect(PRIORITY_WEIGHT.NORMAL).toBeLessThan(PRIORITY_WEIGHT.LOW);
  });
});
