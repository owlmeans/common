import type { ConsumerMailKind, ConsumerRecordKind } from '../types.js'

export const DEFAULT_PUBLIC_MIN_MS = 1000

export const RECORD_KIND: Record<ConsumerMailKind, ConsumerRecordKind> = {
  purchase: 'purchase', consent: 'consent', start: 'consent', withdrawal: 'declaration', cancellation: 'declaration',
}

export const USER_AGENT_MAX = 512

export const HEADER_MAX = 1024

export const DAY_MS = 86_400_000

/** A paygate step failed this often is left to an operator. */
export const MAX_ATTEMPTS = 5

export const CONTRACT_REF_ATTEMPTS = 6
