import { WorkloadKind } from './consts.js'
import type { AddressableSlot } from './types.js'
import type { SlotOriginHelper } from './origin/types.js'

export const createSlotOriginHelper = (): SlotOriginHelper => {
  const slotOrigin = (slot: AddressableSlot): string => {
    const host = slot.host ?? ''
    if (host === '') return ''
    if (host.startsWith('http://') || host.startsWith('https://')) return host

    return `${slot.kind === WorkloadKind.Local ? 'http' : 'https'}://${host}`
  }

  const targetRedirectUrisForOrigin = (origin: string, callbackPath: string): string[] =>
    origin === '' ? [] : [origin, `${origin}${callbackPath}`]

  return { slotOrigin, targetRedirectUrisForOrigin }
}

export const slotOriginHelper = createSlotOriginHelper()
