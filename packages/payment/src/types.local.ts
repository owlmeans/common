import type { ConsumerRightsPolicy } from './types.js'

export type RegionPolicy = Pick<ConsumerRightsPolicy, 'countries'> | null | undefined

export type Dated = Record<string, unknown>
