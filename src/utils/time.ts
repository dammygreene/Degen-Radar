export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function now(): Date {
  return new Date();
}

export function nowMs(): number {
  return Date.now();
}

export function ageMs(from: Date | number, at: Date | number = Date.now()): number {
  const a = from instanceof Date ? from.getTime() : from;
  const b = at instanceof Date ? at.getTime() : at;
  return b - a;
}

export function ageSeconds(from: Date | number, at: Date | number = Date.now()): number {
  return Math.round(ageMs(from, at) / SECOND);
}

/** Human friendly compact age, e.g. "18s", "42m", "3h", "2d". */
export function formatAge(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < MINUTE) return `${Math.round(ms / SECOND)}s`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  return `${Math.round(ms / DAY)}d`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
