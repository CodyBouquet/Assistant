// In-memory sliding-window rate limiter. Fine for a single Railway instance.
// Replace with @upstash/ratelimit + Redis if you ever scale to multiple replicas.

type Bucket = { tokens: number; resetAt: number };

class Limiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  check(key: string): { ok: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const next: Bucket = { tokens: this.max - 1, resetAt: now + this.windowMs };
      this.buckets.set(key, next);
      return { ok: true, remaining: next.tokens, resetAt: next.resetAt };
    }
    if (existing.tokens <= 0) {
      return { ok: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.tokens -= 1;
    return { ok: true, remaining: existing.tokens, resetAt: existing.resetAt };
  }
}

// Public-facing webhook: burst-tolerant but capped.
export const webhookLimiter = new Limiter(30, 60_000); // 30/min per key
// Authenticated chat: lower cap to control LLM spend.
export const chatLimiter = new Limiter(20, 60_000); // 20/min per user
// Auth endpoints: strict to slow magic-link abuse.
export const authLimiter = new Limiter(5, 60_000); // 5/min per key

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
