import type { AllowanceResponse } from '@owlmeans/auth'
import type { AuthModel } from '../types.js'
import type { AbstractRequest } from '@owlmeans/module'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'

export interface AuthPlugin extends Omit<AuthModel, "rely"> {
  type: string
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
