import { createHash } from 'node:crypto'
import type { OtpKeyHelper } from './keys/types.js'

const digest = (scope: string, value: string): string =>
  createHash('sha256').update(`owlmeans:otp:${scope}\0${value}`).digest('hex')

export const createOtpKeyHelper = (): OtpKeyHelper => {
  const otpChallengeKey = (issuanceId: string): string => `challenge:${digest('issuance', issuanceId)}`
  const otpEmailKey = (email: string): string => digest('email', email.trim().toLowerCase())
  const otpCodeHash = (issuanceId: string, code: string): string =>
    digest('code', `${issuanceId}\0${code.trim()}`)

  return { otpChallengeKey, otpEmailKey, otpCodeHash }
}

export const otpKeyHelper = createOtpKeyHelper()
