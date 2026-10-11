import type { AccessTokenStatus } from '../types.js'

/**
 * A revoked token stays in the list so its name still resolves, and it must not read like a
 * working one — so only `active` gets the filled badge, and the two dead states are quiet.
 */
export const STATUS_VARIANT: Record<AccessTokenStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  expired: 'secondary',
  revoked: 'outline',
}

export const COLUMNS = 7
