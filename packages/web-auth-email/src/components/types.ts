import type { ComponentProps, ReactNode } from 'react'
import type { EmailRefusal } from '../refusal/types.js'
import type { EmailPanelPurpose, EmailPasswordAction } from '../password/types.js'
import type { EmailPasswordStatusView } from '@owlmeans/auth-email'
import type { EmailPasswordAliases, Translate } from '../types.js'

/** A password field with a show/hide toggle; every other prop goes to the `<input>`. */
export interface PasswordInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  reveal: boolean
  onReveal: (value: boolean) => void
  /** The toggle's accessible name while the password is hidden. */
  showLabel: string
  /** The toggle's accessible name while the password is shown. */
  hideLabel: string
  /** `data-*` hooks for the toggle button. */
  toggleProps?: Record<`data-${string}`, string>
}

/** A PIN field: digits only, the one-time-code autofill, as many characters as the PIN has. */
export interface PinInputProps extends Omit<ComponentProps<'input'>, 'type' | 'inputMode' | 'autoComplete' | 'maxLength'> {
  length: number
}

/** A primary submit button that is never natively `disabled` — see the screen. */
export interface SubmitButtonProps extends ComponentProps<'button'> {
  busy: boolean
  /** The action cannot go yet; pressing it says why (`aria-disabled`, never `disabled`). */
  blocked?: boolean
}

export interface RefusalAlertProps {
  refusal: EmailRefusal | null
  t: Translate
  locale?: string
  /** The `data-*` attribute that marks this alert for tests (`data-email-login-error`, …). */
  marker: `data-${string}`
  className?: string
}

export interface CaptchaNoticeProps {
  t: Translate
  className?: string
}

export interface EmailLoginCreditProps {
  t: Translate
  className?: string
}

/**
 * The password surface, as a function of what it is given — no I/O: it renders what it is handed
 * and reports what was pressed. `ConnectedPasswordPanel` is this panel wired to `usePassword`.
 */
export interface PasswordPanelProps {
  status: EmailPasswordStatusView | null
  loading?: boolean
  /** A PIN request or a confirmation is in flight. */
  busy?: boolean
  /** The purpose a confirmation PIN was mailed for; the panel shows the PIN step while it is set. */
  pending?: EmailPanelPurpose | null
  refusal?: EmailRefusal | null
  /** The last action that went through. */
  done?: EmailPasswordAction | null
  /** Mail a confirmation PIN. Resolves whether it was sent. */
  onSendPin: (purpose: EmailPanelPurpose) => Promise<boolean>
  /** Confirm the open action. Resolves whether it went through; the panel closes the action then. */
  onConfirm: (action: EmailPasswordAction, input: { pin: string, password?: string }) => Promise<boolean>
  /** The open action was abandoned. */
  onCancel: () => void
  /** Read the status again after it could not be read. */
  onReload?: () => Promise<void> | void
  /** Already-translated header copy; the package's own by default. */
  title?: ReactNode
  description?: ReactNode
  translate?: Translate
  locale?: string
  className?: string
}

export interface ConnectedPasswordPanelProps extends Pick<PasswordPanelProps, 'title' | 'description' | 'className'> {
  /** Where the password routes are mounted; see `EmailPasswordAliases`. */
  aliases?: EmailPasswordAliases
  /** Overrides the package's own translator. */
  translate?: Translate
}
