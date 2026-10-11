import { slotOriginHelper } from './origin.js'
import type { AddressableSlot } from './types.js'

/** @deprecated compat:factory-refactor — use `slotOriginHelper.slotOrigin(…)` */
export const slotOrigin = (slot: AddressableSlot): string => slotOriginHelper.slotOrigin(slot)

/** @deprecated compat:factory-refactor — use `slotOriginHelper.targetRedirectUrisForOrigin(…)` */
export const targetRedirectUrisForOrigin = (origin: string, callbackPath: string): string[] =>
  slotOriginHelper.targetRedirectUrisForOrigin(origin, callbackPath)
