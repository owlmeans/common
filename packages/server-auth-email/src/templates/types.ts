import type { OtpMessage } from '@owlmeans/auth-otp'
import type { EmailMailPurpose } from '../types.js'

/** The words of one language's mails; `line` carries `{{code}}`, `expires` carries `{{minutes}}`. */
export interface EmailMailPhrase {
  subject: string
  line: string
}

export interface EmailMailLanguage {
  phrases: Record<EmailMailPurpose, EmailMailPhrase>
  expires: string
  /** "You did not try to sign in? Ignore it." */
  ignoreSignIn: string
  /** "You did not ask for this? Ignore it." */
  ignoreConfirm: string
}

/** The mails e-mail sign-in sends: built-in in `EMAIL_AUTH_LOCALES`, replaceable per purpose and locale. */
export interface EmailMailTemplates {
  /**
   * The language a request asked for (`pl`, `pl-PL`, `PL`) when a mail exists in it — an
   * application's own or a built-in one — otherwise `en`.
   */
  localeOf: (requested?: string | null) => string
  /** The mail of a purpose in a locale (`localeOf` is applied), placeholders still in place. */
  messageOf: (purpose: EmailMailPurpose, locale?: string | null) => OtpMessage
}
