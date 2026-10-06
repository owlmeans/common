import type { AllowanceResponse } from '@owlmeans/auth'
import type { AppConfig, AppContext, AuthModel } from '../types.js'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { AuthChallengeReplayPolicy } from './consts.js'

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

/** Builds the plugin of one authentication type over the context it serves. */
export interface AuthPluginFactory {
  <C extends AppConfig, T extends AppContext<C>>(context: T): AuthPlugin
}

/** Resolution of the registered plugins, and the check every plugin runs on what it is handed. */
export interface AuthPluginHelper {
  /** @throws {TypeMissmatchError} when a request names another plugin's type */
  assertType: (type: string, plugin: AuthPlugin) => void
  /**
   * The registered plugin of a type, built over the context.
   *
   * @throws {AuthUnknown}
   */
  getPlugin: (type: string, context: AppContext<AppConfig>) => Promise<AuthPlugin>
}
