import type { EstimateCache } from './types.js'

// One instance per gateway service, never module-level (a test builds many contexts in one process,
// and a module-level cache would make "no Stripe call" assertions order-dependent).

/** @param taxTtlMs default 24h; @param fxTtlMs default 1h; @param customerTtlMs default 5min. */
export const makeEstimateCache = (
  taxTtlMs: number = 24 * 60 * 60 * 1_000, fxTtlMs: number = 60 * 60 * 1_000,
  customerTtlMs: number = 5 * 60 * 1_000,
): EstimateCache => ({
  taxTtlMs, fxTtlMs, customerTtlMs, tax: new Map(), fx: new Map(), customer: new Map(), inflight: new Map(),
})
