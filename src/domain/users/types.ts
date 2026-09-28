export interface UserSettings {
  alertEnabled: boolean;
  minScore: number;
  minConfidence: number;
  minLiquidityUsd: number;
  minMarketCapUsd: number;
  maxMarketCapUsd: number;
  convergenceWindowSeconds: number;
  convergenceMinEntities: number;
  maxAlertsPerHour: number;
  tokenCooldownSeconds: number;
  xEnabled: boolean;
  fomoEnabled: boolean;
  walletAlerts: boolean;
  riskAlerts: boolean;
  quietHours: { startHourUtc: number; endHourUtc: number } | null;
}

export function defaultUserSettings(overrides?: Partial<UserSettings>): UserSettings {
  return {
    alertEnabled: true,
    minScore: 75,
    minConfidence: 70,
    minLiquidityUsd: 8_000,
    minMarketCapUsd: 10_000,
    maxMarketCapUsd: 70_000,
    convergenceWindowSeconds: 900,
    convergenceMinEntities: 2,
    maxAlertsPerHour: 5,
    tokenCooldownSeconds: 900,
    xEnabled: true,
    fomoEnabled: true,
    walletAlerts: true,
    riskAlerts: true,
    quietHours: null,
    ...overrides,
  };
}
