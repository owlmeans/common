import {
  EMAIL_PASSWORD_MAX_LENGTH, EMAIL_PASSWORD_MIN_LENGTH, EMAIL_PIN_LENGTH, EmailPasswordPurpose,
} from '@owlmeans/auth-email'
import type { EmailPasswordStatusView } from '@owlmeans/auth-email'
import type { EmailRefusal } from './refusal/types.js'
import type {
  EmailPasswordAction, PasswordPanelForm, PasswordPanelHelper, PasswordPanelState, PasswordPolicy,
} from './password/types.js'

export const createPasswordPanelHelper = (): PasswordPanelHelper => {
  const stateOf = (status: EmailPasswordStatusView | null, loading: boolean): PasswordPanelState => {
    if (status == null) {
      return loading ? 'loading' : 'unreadable'
    }
    if (!status.enabled) {
      return 'off'
    }

    return status.set ? 'set' : 'unset'
  }

  const actionsOf = (status: EmailPasswordStatusView | null): EmailPasswordAction[] => {
    switch (stateOf(status, false)) {
      case 'set':
        return ['change', 'remove']
      case 'unset':
        return ['set']
      default:
        return []
    }
  }

  const purposeOf = (action: EmailPasswordAction): EmailPasswordPurpose =>
    action === 'set' ? EmailPasswordPurpose.Set
      : action === 'change' ? EmailPasswordPurpose.Change : EmailPasswordPurpose.Remove

  const needsPassword = (action: EmailPasswordAction): boolean => action !== 'remove'

  const passwordBlock = (password: string, repeat: string, policy?: PasswordPolicy): EmailRefusal | null => {
    if (password === '') {
      return { kind: 'password-empty' }
    }
    const length = password.normalize('NFKC').length
    if (length < (policy?.minLength ?? EMAIL_PASSWORD_MIN_LENGTH)
      || length > (policy?.maxLength ?? EMAIL_PASSWORD_MAX_LENGTH)) {
      return { kind: 'weak' }
    }

    return password === repeat ? null : { kind: 'mismatch' }
  }

  const confirmBlock = (
    action: EmailPasswordAction, form: PasswordPanelForm, policy?: PasswordPolicy
  ): EmailRefusal | null => {
    if (!new RegExp(`^[0-9]{${policy?.pinLength ?? EMAIL_PIN_LENGTH}}$`).test(form.pin)) {
      return { kind: 'pin-format' }
    }

    return needsPassword(action) ? passwordBlock(form.password, form.repeat, policy) : null
  }

  return { stateOf, actionsOf, purposeOf, needsPassword, passwordBlock, confirmBlock }
}

export const passwordPanelHelper = createPasswordPanelHelper()
