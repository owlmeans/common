import { apiStatusHelper } from '@owlmeans/api'
import {
  EMAIL_PASSWORD_MAX_LENGTH, EMAIL_PASSWORD_MIN_LENGTH, EMAIL_PIN_LENGTH, EmailAuthUnavailable,
  EmailOfferExpired, EmailPasswordDisabled, EmailPasswordWeak,
} from '@owlmeans/auth-email'
import { CaptchaLoadError } from '@owlmeans/web-captcha'
import type { Translate } from './types.js'
import type { EmailRefusal, EmailRefusalContext, EmailRefusalHelper } from './refusal/types.js'
import { textUtils } from './utils/text.js'
import { CAPTCHA_LOAD_ERROR } from './refusal/consts.local.js'

export const createEmailRefusalHelper = (): EmailRefusalHelper => {
  /** Everything an error says about itself: its registered type and its message. */
  const textOf = (error: unknown): string => {
    if (error == null || typeof error !== 'object') {
      return typeof error === 'string' ? error : ''
    }
    const { type, message, name } = error as { type?: unknown, message?: unknown, name?: unknown }

    return [type, name, message].filter(value => typeof value === 'string').join(' ')
  }

  /**
   * Seconds to wait, when the error carries them. An `OtpThrottled` rebuilt from a development
   * body states 1 whatever the server said (the number is not on the wire), so only a longer wait
   * is believed; otherwise the sentence names no time at all.
   */
  const retryAfterOf = (error: unknown): number | undefined => {
    const value = error != null && typeof error === 'object'
      ? (error as { retryAfter?: unknown }).retryAfter : undefined

    return typeof value === 'number' && Number.isFinite(value) && value > 1 ? Math.ceil(value) : undefined
  }

  const refusalOf = (error: unknown, context: EmailRefusalContext): EmailRefusal => {
    const text = textOf(error)
    const status = apiStatusHelper.httpStatusOf(error)

    if (error instanceof CaptchaLoadError || text.includes(CAPTCHA_LOAD_ERROR)) {
      // The browser could not get a token at all — the script did not load or Google gave none.
      return { kind: 'captcha-unavailable' }
    }
    if (status === 429 || /Throttled|:throttled/.test(text)) {
      const retryAfter = retryAfterOf(error)
      return retryAfter != null ? { kind: 'throttled', retryAfter } : { kind: 'throttled' }
    }
    if (text.includes('recaptcha')) {
      return { kind: status === 503 || text.includes('Unavailable') ? 'captcha-unavailable' : 'captcha' }
    }
    if (text.includes(EmailPasswordWeak.typeName) || status === 422) {
      return { kind: 'weak' }
    }
    if (text.includes(EmailOfferExpired.typeName) || status === 409) {
      return { kind: 'offer-expired' }
    }
    if (text.includes(EmailPasswordDisabled.typeName)) {
      return { kind: 'password-disabled' }
    }
    if (text.includes('email:password')) {
      return { kind: 'credentials' }
    }
    if (/otp:(code|email)|authen:challenge|email:confirm/.test(text)) {
      return { kind: 'code' }
    }
    if (status === 503 || text.includes(EmailAuthUnavailable.typeName) || text.includes('Unavailable')) {
      return { kind: 'unavailable' }
    }

    // A production body carries nothing but the status (and the server's own refusal classes are
    // not registered here, so a development one often arrives the same way): read it in the light
    // of the call. A credential refused on a guest route is 401; a captcha or a confirmation PIN
    // refused is 403 — never 401 on a signed-in route, which would drop the session.
    switch (status) {
      case 403:
        return { kind: context === 'send' || context === 'password' ? 'captcha'
          : context === 'pin' || context === 'confirm' || context === 'set' || context === 'remove' ? 'code' : 'failed' }
      case 401:
        return { kind: context === 'password' ? 'credentials' : context === 'pin' || context === 'confirm'
          || context === 'set' || context === 'remove' ? 'code' : 'failed' }
      case 404:
        return { kind: context === 'password' || context === 'status' || context === 'confirm'
          || context === 'set' || context === 'remove' || context === 'offer' ? 'password-disabled' : 'failed' }
      case 400:
        return { kind: context === 'send' ? 'email' : 'failed' }
      default:
        return { kind: 'failed' }
    }
  }

  /** "in 45 seconds", "через 2 минуты" — the language's own plural rules, never a translation's. */
  const waitOf = (seconds: number, locale?: string): string => {
    const minutes = seconds >= 90
    const value = minutes ? Math.ceil(seconds / 60) : seconds
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(value, minutes ? 'minute' : 'second')
    } catch {
      return `${value} ${minutes ? 'min' : 's'}`
    }
  }

  const messageOf = (refusal: EmailRefusal, t: Translate, locale?: string): string => {
    switch (refusal.kind) {
      case 'throttled':
        return refusal.retryAfter != null
          ? textUtils.fill(t('error.throttled-in', 'Too many attempts. Please try again {{when}}.'), {
            when: waitOf(refusal.retryAfter, locale),
          })
          : t('error.throttled', 'Too many attempts. Please wait a little and try again.')
      case 'code':
        return t('error.code', 'This code is wrong or has expired. Check it or ask for a new one.')
      case 'credentials':
        return t('error.credentials', 'Wrong email or password.')
      case 'captcha':
        return t('error.captcha', "We couldn't confirm that you're not a robot. Please try again.")
      case 'captcha-unavailable':
        return t('error.captcha-unavailable', "The security check couldn't load. Check your connection and try again.")
      case 'unavailable':
        return t('error.unavailable', 'Sign-in is temporarily unavailable. Please try again later.')
      case 'email':
        return t('error.email', 'Enter a valid email address.')
      case 'pin-format':
        return textUtils.fill(t('error.pin-format', 'Enter the code from the email: {{length}} digits.'), {
          length: EMAIL_PIN_LENGTH,
        })
      case 'password-empty':
        return t('error.password-empty', 'Enter your password.')
      case 'mismatch':
        return t('error.mismatch', "The passwords don't match.")
      case 'weak':
        return textUtils.fill(t('error.weak', 'Use {{min}} to {{max}} characters, and not your email address.'), {
          min: EMAIL_PASSWORD_MIN_LENGTH, max: EMAIL_PASSWORD_MAX_LENGTH,
        })
      case 'offer-expired':
        return t('error.offer-expired', 'This offer has expired. You can set a password later in your account settings.')
      case 'password-disabled':
        return t('error.password-disabled', 'Password sign-in is not available here. Use a code instead.')
      default:
        return t('error.failed', 'Something went wrong. Please try again.')
    }
  }

  return { refusalOf, messageOf }
}

export const emailRefusalHelper = createEmailRefusalHelper()
