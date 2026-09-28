import { HOUR } from "../../utils/time";

export interface AlertRecord {
  userId: string;
  tokenAddress: string;
  sentAt: Date;
}

export interface CooldownDecision {
  allowed: boolean;
  reason?: string;
}

export interface CooldownConfig {
  tokenCooldownSeconds: number;
  maxAlertsPerHour: number;
}

/**
 * Anti-spam engine (blueprint §12):
 *  - same token: at most one qualifying alert per cooldown window per user
 *  - per user: at most `maxAlertsPerHour`
 *
 * Pure & deterministic: caller supplies the user's recent alert history.
 */
export function evaluateCooldown(
  recent: readonly AlertRecord[],
  candidate: { userId: string; tokenAddress: string },
  config: CooldownConfig,
  now: Date = new Date(),
): CooldownDecision {
  const nowMs = now.getTime();
  const userAlerts = recent.filter((a) => a.userId === candidate.userId);

  // Per-token cooldown
  const cooldownMs = config.tokenCooldownSeconds * 1000;
  const lastForToken = userAlerts
    .filter((a) => a.tokenAddress === candidate.tokenAddress)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
  if (lastForToken && nowMs - lastForToken.sentAt.getTime() < cooldownMs) {
    const waitS = Math.ceil((cooldownMs - (nowMs - lastForToken.sentAt.getTime())) / 1000);
    return { allowed: false, reason: `token cooldown active (${waitS}s remaining)` };
  }

  // Per-hour cap
  const withinHour = userAlerts.filter((a) => nowMs - a.sentAt.getTime() < HOUR);
  if (withinHour.length >= config.maxAlertsPerHour) {
    return { allowed: false, reason: `hourly alert cap reached (${config.maxAlertsPerHour}/h)` };
  }

  return { allowed: true };
}

/** Whether the current UTC time falls inside a user's quiet hours window. */
export function inQuietHours(
  quietHours: { startHourUtc: number; endHourUtc: number } | null,
  now: Date = new Date(),
): boolean {
  if (!quietHours) return false;
  const hour = now.getUTCHours();
  const { startHourUtc: start, endHourUtc: end } = quietHours;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // Wraps midnight
  return hour >= start || hour < end;
}
