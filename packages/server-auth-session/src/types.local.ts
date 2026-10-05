import type { RedisResource } from '@owlmeans/redis-resource'
import type { AuthSessionStoredRecord } from './types.js'

export type SessionResource = RedisResource<AuthSessionStoredRecord>
