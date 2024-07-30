import type { AuthModel } from '../types.js'
import type { AbstractRequest } from '@owlmeans/module'

export interface AuthPlugin extends AuthModel {
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
