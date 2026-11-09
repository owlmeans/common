import {
  EMAIL_PASSWORD_MAX_LENGTH, EMAIL_PASSWORD_MIN_LENGTH, EMAIL_PASSWORD_WIRE_MAX_LENGTH, EmailPasswordWeak,
} from '@owlmeans/auth-email'
import type { EmailAuthServerOptions } from './types.js'
import type { EmailPasswordPolicy } from './policy/types.js'

export const createEmailPasswordPolicy = (option: EmailAuthServerOptions['password']): EmailPasswordPolicy => {
  const on = option === true || (option != null && typeof option === 'object')
  const bounds = typeof option === 'object' && option != null ? option : {}
  const boundOf = (value: number | undefined, fallback: number): number =>
    value != null && Number.isInteger(value) && value >= 1 ? Math.min(value, EMAIL_PASSWORD_WIRE_MAX_LENGTH) : fallback
  const min = boundOf(bounds.minLength, EMAIL_PASSWORD_MIN_LENGTH)
  const max = Math.max(min, boundOf(bounds.maxLength, EMAIL_PASSWORD_MAX_LENGTH))

  const enabled: EmailPasswordPolicy['enabled'] = () => on

  const normalize: EmailPasswordPolicy['normalize'] = password => password.normalize('NFKC')

  const assert: EmailPasswordPolicy['assert'] = (password, email) => {
    const normalized = normalize(password)
    const length = [...normalized].length
    if (length < min || length > max) {
      throw new EmailPasswordWeak('length')
    }
    if (normalized.trim().toLowerCase() === email.trim().toLowerCase()) {
      throw new EmailPasswordWeak('email')
    }

    return normalized
  }

  return { enabled, normalize, assert }
}
