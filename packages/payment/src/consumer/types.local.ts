import type { ConsumerRightsPolicy } from '../types.js'
import type { ConsumerRightsPublicProtocols, ConsumerRightsScreens } from './types.js'

export interface DeadlinePolicy extends Pick<ConsumerRightsPolicy, 'withdrawalDays' | 'deadline'> {}

export type PublicOf<P> = P extends { screens: object }
  ? ConsumerRightsPublicProtocols & { screens: ConsumerRightsScreens }
  : ConsumerRightsPublicProtocols

export type Dated = Record<string, unknown>
