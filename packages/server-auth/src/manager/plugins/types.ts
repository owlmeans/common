import type { AllowanceResponse } from '@owlmeans/auth'
import type { AuthModel } from '../types.js'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { AuthChallengeReplayPolicy } from './replay-policy.js'

export interface AuthPlugin extends Omit<AuthModel, "rely"> {
  type: string
  /**
   * Who atomically consumes a verified challenge. The manager remains the default; a plugin may
   * opt in only when its own credential protocol needs a bounded retry budget before consumption.
   */
  challengeReplayPolicy?: AuthChallengeReplayPolicy
}

export interface RecpatchaResponse {
  success: boolean
  challenge_ts: number
  hostname: string
  'error-codes'?: string[]
}

export interface RecaptchaRequest extends AbstractRequest<{
  secret: string
  response: string
  remoteip?: string
}> { }

export interface RelyRecord extends ResourceRecord, AllowanceResponse {
}

export interface AuthRedisResource extends RedisResource<RelyRecord> {}
