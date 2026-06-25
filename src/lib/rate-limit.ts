// Rate limiter en memoria — fixed-window por clave arbitraria.
// Válido para servidor único (VPS/Railway). Si se escala a múltiples
// instancias hay que reemplazar `checkRateLimit` con Redis/Upstash;
// los call sites no cambian.

import { NextResponse } from "next/server";

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Entry>();

const LIGHT_SWEEP_EVERY = 1000;
let callsSinceSweep = 0;

function sweepExpired(now: number) {
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();

  callsSinceSweep += 1;
  if (callsSinceSweep >= LIGHT_SWEEP_EVERY) {
    callsSinceSweep = 0;
    sweepExpired(now);
  }

  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, reset: now + windowMs, limit };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, reset: entry.resetAt, limit };
  }

  entry.count += 1;
  return { success: true, remaining: limit - entry.count, reset: entry.resetAt, limit };
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Rate limit exceeded", retry_after_seconds: retryAfterSec },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
      },
    },
  );
}

export const RATE_LIMITS = {
  // Webhook de Meta: 200/min por IP — Meta envía ráfagas cortas;
  // este límite frena bots que conozcan la URL antes del HMAC check.
  webhook: { limit: 200, windowMs: 60_000 },
  // Acciones de admin (endpoints internos que no usan CRON_SECRET): 60/min.
  adminAction: { limit: 60, windowMs: 60_000 },
  // Envío manual de WhatsApp desde UI: 60/min por usuario.
  send: { limit: 60, windowMs: 60_000 },
} as const;
