import type { PlanStatusTone, PlanStatusLineKind } from './types.js'
import { SubscriptionStatus } from '@owlmeans/payment'

/** The reasons the package phrases itself; any other reads the generic sentence. */
export const KNOWN_REASONS = ['per-purchase', 'window', 'total', 'hold']

export const DEFAULT_TTL_MS = 5 * 60_000

export const TONE_DOT: Record<PlanStatusTone, string> = {
  ok: 'bg-primary',
  warning: 'bg-destructive/60',
  critical: 'bg-destructive',
  inactive: 'bg-muted-foreground',
}

export const INACTIVE: Partial<Record<SubscriptionStatus, PlanStatusLineKind>> = {
  [SubscriptionStatus.Created]: 'created',
  [SubscriptionStatus.Canceled]: 'canceled',
  [SubscriptionStatus.Expired]: 'expired',
  [SubscriptionStatus.Ended]: 'ended',
}
