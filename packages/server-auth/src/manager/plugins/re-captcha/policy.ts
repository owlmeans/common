import { AuthenFailed } from '@owlmeans/auth'
import { PluginMissconfigured } from '@owlmeans/config'
import type { ReCaptchaPluginConfig, ReCaptchaPolicyModel, ReCaptchaResponse } from './types.js'

/** A comma- or space-separated config string as its entries; `''` and absent are no entries. */
const listOf = (value: unknown): string[] =>
  typeof value === 'string' ? value.split(/[\s,]+/).map(entry => entry.trim()).filter(entry => entry !== '') : []

/** A host as it is compared: lowercased, without a trailing dot or a leading `*.`/`.`. */
const hostOf = (value: string): string => value.trim().toLowerCase().replace(/\.$/, '').replace(/^\*?\./, '')

export const makeReCaptchaPolicyModel = (record: ReCaptchaPluginConfig): ReCaptchaPolicyModel => {
  const hostnames = (): string[] => listOf(record.hostnames).map(hostOf).filter(host => host !== '')

  const minScore = (): number | null => {
    const value = record.minScore
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      return null
    }
    const score = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new PluginMissconfigured('minScore')
    }

    return score
  }

  const actions = (): string[] => listOf(record.actions)

  const assert = (response: ReCaptchaResponse): void => {
    if (response.success !== true) {
      const codes = Array.isArray(response['error-codes']) ? response['error-codes'] : []
      throw new AuthenFailed('recaptcha:' + (codes.length > 0 ? codes.join(',') : 'unknown'))
    }

    const allowed = hostnames()
    if (allowed.length > 0) {
      const host = typeof response.hostname === 'string' ? hostOf(response.hostname) : ''
      if (host === '' || !allowed.some(entry => host === entry || host.endsWith(`.${entry}`))) {
        throw new AuthenFailed('recaptcha:hostname')
      }
    }

    const floor = minScore()
    if (floor != null && typeof response.score === 'number' && response.score < floor) {
      throw new AuthenFailed('recaptcha:score')
    }

    const named = actions()
    if (named.length > 0 && (typeof response.action !== 'string' || !named.includes(response.action))) {
      throw new AuthenFailed('recaptcha:action')
    }
  }

  return { record, hostnames, minScore, actions, assert }
}
