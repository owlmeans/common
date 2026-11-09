import type { OtpMessage } from '@owlmeans/auth-otp'
import type { EmailAuthLocale } from '@owlmeans/auth-email'
import type { EmailMailOverrides, EmailMailPurpose } from './types.js'
import { EMAIL_MAIL_DEFAULT_LOCALE, EMAIL_MAIL_LANGUAGES } from './templates/consts.js'
import type { EmailMailTemplates } from './templates/types.js'

export const createEmailMailTemplates = (overrides: EmailMailOverrides = {}): EmailMailTemplates => {
  const escape = (value: string): string =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

  const builtIn = (locale: string): locale is EmailAuthLocale => Object.hasOwn(EMAIL_MAIL_LANGUAGES, locale)

  const overridden = (locale: string): boolean =>
    Object.values(overrides).some(byLocale => byLocale != null && Object.hasOwn(byLocale, locale))

  const localeOf: EmailMailTemplates['localeOf'] = requested => {
    const primary = (requested ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''

    return primary !== '' && (builtIn(primary) || overridden(primary)) ? primary : EMAIL_MAIL_DEFAULT_LOCALE
  }

  const compose = (purpose: EmailMailPurpose, locale: EmailAuthLocale): OtpMessage => {
    const language = EMAIL_MAIL_LANGUAGES[locale]
    const { subject, line } = language.phrases[purpose]
    const ignore = purpose === 'sign-in' ? language.ignoreSignIn : language.ignoreConfirm

    return {
      subject,
      text: `${line}\n\n${language.expires}\n${ignore}`,
      html: `<p>${escape(line).replace('{{code}}', '<strong>{{code}}</strong>')}</p>`
        + `<p>${escape(language.expires)}</p><p>${escape(ignore)}</p>`,
    }
  }

  const messageOf: EmailMailTemplates['messageOf'] = (purpose, requested) => {
    const locale = localeOf(requested)
    const own = overrides[purpose]
    if (own != null && Object.hasOwn(own, locale)) {
      return own[locale]!
    }

    return compose(purpose, builtIn(locale) ? locale : EMAIL_MAIL_DEFAULT_LOCALE)
  }

  return { localeOf, messageOf }
}
