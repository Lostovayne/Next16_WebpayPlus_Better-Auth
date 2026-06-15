import type { RateLimitGateway, RateLimitResult } from "../domain/RateLimitGateway";

interface WindowEntry {
  timestamps: number[];
}

/**
 * Parse a human-readable window string into milliseconds.
 *
 * Supported formats:
 * - "10 s"  → 10_000 ms
 * - "1 m"   → 60_000 ms
 * - "1 h"   → 3_600_000 ms
 *
 * Defaults to seconds if no unit suffix is provided.
 */
function parseWindow(window: string): number {
  const trimmed = window.trim();
  const match = trimmed.match(/^(\d+)\s*(s|m|h)?$/);

  if (!match) {
    throw new Error(`[MemoryRateLimitGateway] Invalid window format: "${window}". Expected "N s", "N m", or "N h".`);
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2] ?? "s";

  const multipliers: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000 };
  return value * multipliers[unit];
}

/**
 * In-memory sliding window rate limiter for local development.
 *
 * No external dependencies. Uses a Map with timestamp arrays.
 * Suitable for single-instance local dev and tests — NOT for production
 * where requests may hit different instances.
 *
 * Stale entries are cleaned up lazily on each check to prevent unbounded growth.
 */
export class MemoryRateLimitGateway implements RateLimitGateway {
  private readonly store = new Map<string, WindowEntry>();

  async check(key: string, window: string, limit: number): Promise<RateLimitResult> {
    const windowMs = parseWindow(window);
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Remove timestamps outside the current window (sliding window eviction)
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    const remaining = Math.max(0, limit - entry.timestamps.length);
    const success = entry.timestamps.length < limit;

    if (success) {
      entry.timestamps.push(now);
    }

    // Calculate when the oldest request in the window expires
    const reset = entry.timestamps.length > 0
      ? Math.ceil((entry.timestamps[0] + windowMs) / 1000)
      : Math.ceil((now + windowMs) / 1000);

    return {
      success,
      limit,
      remaining,
      reset,
    };
  }

  /** Reset all entries — useful for tests. */
  clear(): void {
    this.store.clear();
  }
}
