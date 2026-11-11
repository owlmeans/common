import { AuthenFailed } from '@owlmeans/auth'
import { PluginMissconfigured } from '@owlmeans/config'
import type { CaptchaPolicyModel, CaptchaPolicyRecord, CaptchaVerdict } from './types.js'
import { policyUtils } from './utils/policy.js'

/**
 * The lenient policy of the captcha guest sign-in: every field of the record is optional, and an
 * empty one is no check (a verdict without a score passes any score floor).
 */
export const makeCaptchaPolicyModel = (record: CaptchaPolicyRecord): CaptchaPolicyModel => {
  const { listOf, hostOf, hostAllowed } = policyUtils

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

  const assert = (verdict: CaptchaVerdict): void => {
    if (verdict.success !== true) {
      const codes = Array.isArray(verdict.errors) ? verdict.errors : []
      throw new AuthenFailed('captcha:' + (codes.length > 0 ? codes.join(',') : 'unknown'))
    }

    const allowed = hostnames()
    if (allowed.length > 0 && !hostAllowed(allowed, verdict.hostname)) {
      throw new AuthenFailed('captcha:hostname')
    }

    const floor = minScore()
    if (floor != null && typeof verdict.score === 'number' && verdict.score < floor) {
      throw new AuthenFailed('captcha:score')
    }

    const named = actions()
    if (named.length > 0 && (typeof verdict.action !== 'string' || !named.includes(verdict.action))) {
      throw new AuthenFailed('captcha:action')
    }
  }

  return { record, hostnames, minScore, actions, assert }
}
