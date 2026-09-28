export type AlertType =
  | "WATCHED_WALLET_SIGNAL"
  | "FOMO_SIGNAL"
  | "CONVERGENCE"
  | "MOMENTUM_SPIKE"
  | "NARRATIVE_ACCELERATION"
  | "RISK_CHANGE"
  | "SCORE_CROSS"
  | "LIQUIDITY_CHANGE";

export interface QualificationContext {
  alertType: AlertType;
  /** For convergence alerts: independent cluster-adjusted entity count. */
  independentEntities?: number;
  marketCapUsd?: number | null;
  liquidityUsd?: number | null;
}

export interface QualificationResult {
  qualifies: boolean;
  reasons: string[];
}
