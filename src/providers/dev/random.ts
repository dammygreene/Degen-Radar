import { createHash } from "node:crypto";

/**
 * Deterministic pseudo-randomness derived from a seed string. Used ONLY by
 * development/mock adapters so demos are reproducible. Never used in production
 * paths (guarded by USE_MOCK_PROVIDERS / missing credentials).
 */
export class SeededRandom {
  private state: number;

  constructor(seed: string) {
    const hash = createHash("sha256").update(seed).digest();
    this.state = hash.readUInt32BE(0) || 1;
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }

  int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  bool(pTrue = 0.5): boolean {
    return this.next() < pTrue;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
}
