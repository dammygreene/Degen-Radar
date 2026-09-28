import type { TradeSide } from "../domain/types";

export type RadarEventType =
  | "wallet.buy.detected"
  | "wallet.sell.detected"
  | "fomo.buy.detected"
  | "fomo.sell.detected"
  | "token.discovered"
  | "token.scan.requested"
  | "token.scan.completed"
  | "token.risk.changed"
  | "token.momentum.changed"
  | "token.narrative.changed"
  | "token.convergence.detected"
  | "alert.created"
  | "alert.sent"
  | "outcome.snapshot.created";

export interface RadarEventEnvelope<T = unknown> {
  eventId: string;
  eventType: RadarEventType;
  occurredAt: string; // ISO
  source: string;
  idempotencyKey: string;
  payload: T;
}

export interface WalletBuyPayload {
  wallet: string;
  entityId: string | null;
  entityType: "wallet" | "fomo";
  tokenAddress: string;
  side: TradeSide;
  amountUsd: number | null;
  occurredAt: string;
  signature: string | null;
  providerEventId: string | null;
}

export interface TokenScanRequestedPayload {
  tokenAddress: string;
  reason: "WATCHED_WALLET_BUY" | "FOMO_BUY" | "CONVERGENCE" | "MANUAL" | "DISCOVERY" | "MOMENTUM";
  triggerEntityId?: string | null;
  requestedByUserId?: string | null;
}

export interface TokenScanCompletedPayload {
  tokenAddress: string;
  scanId: string;
  score: number;
  confidence: number;
  criticalRisk: boolean;
}
