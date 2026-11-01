import type { MouseEvent } from 'react'
import type { EmailPasswordPurpose, EmailPasswordStatusView } from '@owlmeans/auth-email'
import type { EmailLoginState } from '../state/types.js'
import type { EmailRefusal } from '../refusal/types.js'
import type { EmailPasswordAction } from '../password/types.js'

export interface UseEmailLoginOptions {
  /** The interface language; its base language travels with send-PIN and sign-in, for the mail. */
  locale?: string
  /** Pre-fill the address. */
  email?: string
}

/** The "Other sign-in options" link back to the chooser. */
export interface EmailLoginOtherOptions {
  href: string
  go: (event?: MouseEvent) => void
}

/**
 * The headless e-mail sign-in form — everything `EmailLoginScreen` renders from, for a replacement
 * screen to render its own way (`registerEmailLoginScreen`).
 *
 * Every action is safe to call at any time: a call while another is in flight does nothing, and a
 * call the form cannot make yet sets `state.refusal` (an invalid address, an incomplete code)
 * instead of sending anything.
 */
export interface EmailLoginModel {
  state: EmailLoginState
  /** The deployment asked for a captcha — show Google's notice. */
  captcha: boolean
  /** Password sign-in is offered — show "Already set a password? Use it". */
  passwordOffered: boolean
  pinLength: number
  setEmail: (value: string) => void
  setPin: (value: string) => void
  setPassword: (value: string) => void
  setReveal: (value: boolean) => void
  /** Mail a PIN (from the e-mail step) or a new one (from the PIN step). */
  send: () => Promise<void>
  /** Sign in with the typed PIN. */
  verify: () => Promise<void>
  /** Sign in with the password; an unknown device answers with a mailed PIN instead. */
  signIn: () => Promise<void>
  /** What Enter does on the current step. */
  submit: () => Promise<void>
  choosePassword: () => void
  choosePin: () => void
  changeEmail: () => void
  /** Ask for the options again after they failed to load. */
  retryOptions: () => Promise<void>
  /** Null where the chooser is not bound in this application. */
  otherOptions: EmailLoginOtherOptions | null
}

export interface UsePasswordOptions {
  /** The interface language; its base language travels with the confirmation-PIN request. */
  locale?: string
}

/** The I/O half of the password panel. Nothing thrown reaches the caller — it lands in `refusal`. */
export interface UsePassword {
  status: EmailPasswordStatusView | null
  loading: boolean
  /** A PIN request or a confirmation is in flight. */
  busy: boolean
  /** The purpose a confirmation PIN was mailed for; null while none waits. */
  pending: EmailPasswordPurpose | null
  refusal: EmailRefusal | null
  /** The last action that went through, for a short confirmation. */
  done: EmailPasswordAction | null
  reload: () => Promise<void>
  /** Mail a confirmation PIN to the account's own address. Resolves whether it was sent. */
  sendPin: (purpose: EmailPasswordPurpose) => Promise<boolean>
  /** Confirm an action with the mailed PIN (and the new password for set/change). Resolves whether it went through. */
  confirm: (action: EmailPasswordAction, input: { pin: string, password?: string }) => Promise<boolean>
  /** Abandon a pending confirmation. */
  cancel: () => void
}
