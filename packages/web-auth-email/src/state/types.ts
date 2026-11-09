import type { EmailAuthOptionsView } from '@owlmeans/auth-email'
import type { EmailRefusal } from '../refusal/types.js'

/** Which part of the form is showing. `done` = signed in, the browser is leaving. */
export type EmailLoginStep = 'email' | 'pin' | 'password' | 'done'

/** The call in flight: mailing a PIN, or signing in (PIN or password). */
export type EmailLoginBusy = 'send' | 'sign-in'

/** Why the PIN step is up: a code was asked for, or a password sign-in met an unknown device. */
export type EmailLoginNotice = 'sent' | 'device'

/** The whole e-mail sign-in form, as a plain value. */
export interface EmailLoginState {
  step: EmailLoginStep
  email: string
  pin: string
  password: string
  /** The password field shows what was typed. */
  reveal: boolean
  /** The signed challenge of the PIN mailed last; null until one is. */
  challenge: string | null
  notice: EmailLoginNotice | null
  busy: EmailLoginBusy | null
  refusal: EmailRefusal | null
  /** What the deployment offers; null until `GET options` answered. */
  options: EmailAuthOptionsView | null
  /** The options read failed — the form still works, and the next send asks again. */
  optionsFailed: boolean
}

/** Everything that changes the form. */
export type EmailLoginAction =
  | { type: 'options', options: EmailAuthOptionsView }
  | { type: 'options-failed' }
  | { type: 'email', value: string }
  | { type: 'pin', value: string }
  | { type: 'password', value: string }
  | { type: 'reveal', value: boolean }
  | { type: 'choose-password' }
  | { type: 'choose-pin' }
  | { type: 'change-email' }
  | { type: 'start', busy: EmailLoginBusy }
  | { type: 'sent', challenge: string }
  | { type: 'device', challenge: string }
  | { type: 'signed-in' }
  | { type: 'refused', refusal: EmailRefusal }

/**
 * The e-mail sign-in form as pure transitions — what `useEmailLogin` runs through `useReducer`, and
 * what a replacement screen or a test can drive without a DOM.
 */
export interface EmailLoginStateHelper {
  /** The empty form on its e-mail step. */
  initial: (email?: string) => EmailLoginState
  /** The next form after `action`. Never mutates `state`. */
  reduce: (state: EmailLoginState, action: EmailLoginAction) => EmailLoginState
  /** A plausible address: one `@`, a dotted domain, no spaces, within the wire bound. */
  validEmail: (email: string) => boolean
  /** The address as it is sent: trimmed and lowercased. */
  normalizeEmail: (email: string) => string
  /** Digits in a PIN — the deployment's own when known. */
  pinLength: (state: EmailLoginState) => number
  /** Password sign-in is offered here. */
  passwordOffered: (state: EmailLoginState) => boolean
  /** What stops "send a PIN" right now (the address), or null when it may go. */
  sendBlock: (state: EmailLoginState) => EmailRefusal | null
  /** What stops "sign in with the PIN" right now, or null when it may go. */
  verifyBlock: (state: EmailLoginState) => EmailRefusal | null
  /** What stops a password sign-in right now, or null when it may go. */
  signInBlock: (state: EmailLoginState) => EmailRefusal | null
}
