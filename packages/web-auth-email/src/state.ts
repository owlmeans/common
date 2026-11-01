import { EMAIL_ADDRESS_MAX_LENGTH, EMAIL_PIN_LENGTH } from '@owlmeans/auth-email'
import type { EmailRefusal } from './refusal/types.js'
import type { EmailLoginAction, EmailLoginState, EmailLoginStateHelper } from './state/types.js'

export const createEmailLoginStateHelper = (): EmailLoginStateHelper => {
  const address = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const initial = (email: string = ''): EmailLoginState => ({
    step: 'email', email, pin: '', password: '', reveal: false, challenge: null, notice: null,
    busy: null, refusal: null, options: null, optionsFailed: false,
  })

  const normalizeEmail = (email: string): string => email.trim().toLowerCase()

  const validEmail = (email: string): boolean => {
    const value = normalizeEmail(email)

    return value.length <= EMAIL_ADDRESS_MAX_LENGTH && address.test(value)
  }

  const pinLength = (state: EmailLoginState): number => state.options?.pinLength ?? EMAIL_PIN_LENGTH

  const passwordOffered = (state: EmailLoginState): boolean => state.options?.password === true

  const sendBlock = (state: EmailLoginState): EmailRefusal | null =>
    validEmail(state.email) ? null : { kind: 'email' }

  const verifyBlock = (state: EmailLoginState): EmailRefusal | null => {
    if (state.challenge == null) {
      // Nothing was mailed for this form yet — the person has to ask for a code first.
      return { kind: 'code' }
    }

    return new RegExp(`^[0-9]{${pinLength(state)}}$`).test(state.pin) ? null : { kind: 'pin-format' }
  }

  const signInBlock = (state: EmailLoginState): EmailRefusal | null => {
    if (!validEmail(state.email)) {
      return { kind: 'email' }
    }
    if (!passwordOffered(state)) {
      return { kind: 'password-disabled' }
    }

    return state.password === '' ? { kind: 'password-empty' } : null
  }

  const reduce = (state: EmailLoginState, action: EmailLoginAction): EmailLoginState => {
    switch (action.type) {
      case 'options':
        return {
          ...state, options: action.options, optionsFailed: false,
          // The deployment turned passwords off under an open password step: back to the code.
          ...(state.step === 'password' && action.options.password !== true
            ? { step: 'email', password: '', reveal: false } : {}),
        }
      case 'options-failed':
        return { ...state, optionsFailed: true }
      case 'email':
        return state.step === 'done' ? state : { ...state, email: action.value, refusal: null }
      case 'pin':
        return state.step === 'done' ? state : {
          ...state, pin: action.value.replace(/\D/g, '').slice(0, pinLength(state)), refusal: null,
        }
      case 'password':
        return state.step === 'done' ? state : { ...state, password: action.value, refusal: null }
      case 'reveal':
        return { ...state, reveal: action.value }
      case 'choose-password':
        return state.busy != null || !passwordOffered(state) || state.step === 'done' ? state : {
          ...state, step: 'password', pin: '', notice: null, refusal: null,
        }
      case 'choose-pin':
        return state.busy != null || state.step === 'done' ? state : {
          ...state, step: 'email', password: '', reveal: false, refusal: null,
        }
      case 'change-email':
        return state.busy != null || state.step === 'done' ? state : {
          ...state, step: 'email', pin: '', password: '', reveal: false, challenge: null, notice: null, refusal: null,
        }
      case 'start':
        return state.busy != null || state.step === 'done' ? state : { ...state, busy: action.busy, refusal: null }
      case 'sent':
        return { ...state, step: 'pin', challenge: action.challenge, notice: 'sent', pin: '', busy: null, refusal: null }
      case 'device':
        // A password sign-in on a device the account does not know: the password was NOT checked,
        // a PIN was mailed instead, and the password is not kept around for later.
        return {
          ...state, step: 'pin', challenge: action.challenge, notice: 'device', pin: '', password: '',
          reveal: false, busy: null, refusal: null,
        }
      case 'signed-in':
        // Nothing secret stays in the form while the browser is leaving.
        return { ...state, step: 'done', pin: '', password: '', reveal: false, busy: null, refusal: null }
      case 'refused':
        return {
          ...state,
          // Completing a sign-in failed after the answer: the person starts over from the address.
          ...(state.step === 'done' ? { step: 'email', challenge: null, notice: null } : {}),
          busy: null,
          refusal: action.refusal,
          ...(action.refusal.kind === 'code' ? { pin: '' } : {}),
          ...(action.refusal.kind === 'credentials' ? { password: '' } : {}),
        }
      default:
        return state
    }
  }

  return {
    initial, reduce, validEmail, normalizeEmail, pinLength, passwordOffered, sendBlock, verifyBlock, signInBlock,
  }
}

export const emailLoginStateHelper = createEmailLoginStateHelper()
