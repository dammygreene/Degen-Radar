export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation of `x` from [inMin,inMax] onto [outMin,outMax], clamped. */
export function lerp(
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = clamp((x - inMin) / (inMax - inMin), 0, 1);
  return outMin + t * (outMax - outMin);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Safe ratio a/b that never divides by zero. Returns null if undefined. */
export function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return a / b;
}

/** Percentage change from `from` to `to`; null if base is 0 / missing. */
export function pctChange(
  from: number | null | undefined,
  to: number | null | undefined,
): number | null {
  if (!isNum(from) || !isNum(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}
