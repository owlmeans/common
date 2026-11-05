import type { EMAIL_DEVICE_PIN_PURPOSE, EmailPasswordPurpose, EmailPasswordStatusView } from '@owlmeans/auth-email'
import type { EmailRefusal } from '../refusal/types.js'

/** What a person can do with their password from the panel, the new-device PIN switch included. */
export type EmailPasswordAction = 'set' | 'change' | 'remove' | 'device-pin'

/** What a confirmation PIN of the panel is mailed for: a password action or the new-device PIN switch. */
export type EmailPanelPurpose = EmailPasswordPurpose | typeof EMAIL_DEVICE_PIN_PURPOSE

/**
 * What the panel shows: the status is still loading, could not be read, passwords are off on this
 * deployment, or the account has no password / has one.
 */
export type PasswordPanelState = 'loading' | 'unreadable' | 'off' | 'unset' | 'set'

/** The panel's own fields while an action is open. */
export interface PasswordPanelForm {
  pin: string
  password: string
  repeat: string
}

/** The policy a new password is checked against before it is sent. */
export interface PasswordPolicy {
  minLength?: number
  maxLength?: number
  pinLength?: number
}

/** The password panel and the offer step as pure decisions — no React, no I/O. */
export interface PasswordPanelHelper {
  stateOf: (status: EmailPasswordStatusView | null, loading: boolean) => PasswordPanelState
  /**
   * The actions offered for a status: `set` without a password; `change` + `remove` with one, and
   * `device-pin` too when the server reports the new-device PIN.
   */
  actionsOf: (status: EmailPasswordStatusView | null) => EmailPasswordAction[]
  /** The confirmation PIN's purpose for an action — what `password/pin` (or the switch) is asked for. */
  purposeOf: (action: EmailPasswordAction) => EmailPanelPurpose
  /** Whether the action asks for a new password (set, change) or only a PIN (remove, device-pin). */
  needsPassword: (action: EmailPasswordAction) => boolean
  /**
   * What stops a new password from being sent: empty, outside the length bounds (NFKC, as the
   * server counts), or not repeated exactly. Null when it may go.
   */
  passwordBlock: (password: string, repeat: string, policy?: PasswordPolicy) => EmailRefusal | null
  /** What stops "Confirm" for an action: the PIN's format first, then the new password. */
  confirmBlock: (action: EmailPasswordAction, form: PasswordPanelForm, policy?: PasswordPolicy) => EmailRefusal | null
}
