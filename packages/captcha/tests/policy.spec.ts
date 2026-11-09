import { describe, expect, test } from 'bun:test'
import { AuthenFailed, MOD_RECAPTCHA } from '@owlmeans/auth'
import { PluginMissconfigured } from '@owlmeans/config'
import { makeCaptchaPolicyModel } from '../src/policy.js'
import type { CaptchaPolicyRecord, CaptchaResponse } from '../src/types.js'

const RECORD: CaptchaPolicyRecord = {
  id: MOD_RECAPTCHA, value: 'secret', hostnames: 'owlmeans.org, owlmeans.com', minScore: '0.5', actions: 'inquiry',
}

const GOOD: CaptchaResponse = {
  success: true, challenge_ts: '2026-10-06T10:00:00Z', hostname: 'vib-dev-1.owlmeans.org', score: 0.9, action: 'inquiry',
}

const reasonOf = (record: CaptchaPolicyRecord, answer: Partial<CaptchaResponse>): string | null => {
  try {
    makeCaptchaPolicyModel(record).assert({ ...GOOD, ...answer })
    return null
  } catch (error) {
    expect(error).toBeInstanceOf(AuthenFailed)
    return (error as Error).message
  }
}

describe('@owlmeans/captcha — lenient policy model', () => {
  test('parses the record as a mounted config file delivers it', () => {
    const policy = makeCaptchaPolicyModel({ id: MOD_RECAPTCHA, hostnames: ' a.org,b.com  *.c.net ', minScore: '0.7', actions: 'inquiry, contact' })

    expect(policy.hostnames()).toEqual(['a.org', 'b.com', 'c.net'])
    expect(policy.minScore()).toBe(0.7)
    expect(policy.actions()).toEqual(['inquiry', 'contact'])
    expect(makeCaptchaPolicyModel({ id: MOD_RECAPTCHA, minScore: 0 }).minScore()).toBe(0)
  })

  test('a score floor that is not a number of 0…1 is a misconfigured plugin', () => {
    for (const minScore of ['high', '1.5', '-0.1']) {
      expect(() => makeCaptchaPolicyModel({ id: MOD_RECAPTCHA, minScore }).minScore()).toThrow(PluginMissconfigured)
    }
  })

  test('refuses in order: Google\'s own answer, hostname, score, action', () => {
    const cases: [Partial<CaptchaResponse>, string | null][] = [
      [{ hostname: 'owlmeans.com' }, null],
      [{ hostname: 'Platform.OwlMeans.com.' }, null],
      [{ hostname: 'evil.com' }, 'recaptcha:hostname'],
      [{ hostname: 'notowlmeans.org' }, 'recaptcha:hostname'],
      [{ hostname: '' }, 'recaptcha:hostname'],
      [{ score: 0.3 }, 'recaptcha:score'],
      [{ score: 0.5 }, null],
      [{ score: undefined }, null],
      [{ action: 'login' }, 'recaptcha:action'],
      [{ action: undefined }, 'recaptcha:action'],
      [{ success: false, 'error-codes': ['timeout-or-duplicate'] }, 'recaptcha:timeout-or-duplicate'],
      [{ success: false }, 'recaptcha:unknown'],
      [{ success: false, hostname: 'evil.com', score: 0 }, 'recaptcha:unknown'],
      [{ hostname: 'evil.com', score: 0, action: 'login' }, 'recaptcha:hostname'],
    ]
    for (const [answer, reason] of cases) {
      const refused = reasonOf(RECORD, answer)
      if (reason == null) {
        expect([answer, refused]).toEqual([answer, null])
      } else {
        expect([answer, refused]).toEqual([answer, expect.stringContaining(reason)])
      }
    }
  })

  test('an empty or absent policy field is no check', () => {
    const open: CaptchaPolicyRecord = { id: MOD_RECAPTCHA, value: 'secret', hostnames: '', minScore: '', actions: '' }

    expect(reasonOf(open, { hostname: 'anywhere.example', score: 0, action: undefined })).toBeNull()
    expect(reasonOf({ id: MOD_RECAPTCHA }, { hostname: 'anywhere.example', score: 0.1, action: 'other' })).toBeNull()
  })
})
