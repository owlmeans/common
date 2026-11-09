import { useId, useState, type FC, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { EMAIL_PASSWORD_MAX_LENGTH, EMAIL_PIN_LENGTH } from '@owlmeans/auth-email'
import { Button } from '../@/components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../@/components/ui/card.js'
import { Label } from '../@/components/ui/label.js'
import { cn } from '../@/lib/utils.js'
import { passwordPanelHelper } from '../password.js'
import { textUtils } from '../utils/text.js'
import type { EmailPasswordAction } from '../password/types.js'
import type { EmailRefusal } from '../refusal/types.js'
import type { Translate } from '../types.js'
import { PasswordInput, PinInput, RefusalAlert, SubmitButton } from './fields.js'
import type { PasswordPanelProps } from './types.js'

const english: Translate = (_key, defaultValue) => defaultValue

/** A record's moment in the reader's language, or null when it has none worth showing. */
const dateOf = (value: string | undefined, locale?: string): string | null => {
  if (value == null) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/**
 * The account's password: off on this deployment (a short notice), none yet (Set), or one (Change,
 * Remove, and — when the server reports it — the switch of the new-device PIN, which turns the code
 * a password sign-in on a new device asks for off or back on). Every action is confirmed by a PIN
 * mailed to the account's own address: "Send code", then the code (and the new password, twice, for
 * set and change), then Confirm.
 *
 * Presentational by contract — it performs no I/O, renders what it is given and reports what was
 * pressed. `ConnectedPasswordPanel` is this panel wired to `usePassword`.
 */
export const PasswordPanel: FC<PasswordPanelProps> = ({
  status, loading = false, busy = false, pending = null, refusal = null, done = null,
  onSendPin, onConfirm, onCancel, onReload, title, description, translate, locale, className,
}) => {
  const t = translate ?? english
  const id = useId()
  const [action, setAction] = useState<EmailPasswordAction | null>(null)
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [reveal, setReveal] = useState(false)
  const [local, setLocal] = useState<EmailRefusal | null>(null)

  const state = passwordPanelHelper.stateOf(status, loading)
  const actions = passwordPanelHelper.actionsOf(status)
  const sent = action != null && pending === passwordPanelHelper.purposeOf(action)
  const withPassword = action != null && passwordPanelHelper.needsPassword(action)
  const shown = local ?? refusal

  const reset = (): void => {
    setAction(null)
    setPin('')
    setPassword('')
    setRepeat('')
    setReveal(false)
    setLocal(null)
  }

  const open = (next: EmailPasswordAction): void => {
    reset()
    setAction(next)
    if (pending != null) {
      onCancel()
    }
  }

  const close = (): void => {
    reset()
    onCancel()
  }

  const send = async (): Promise<void> => {
    if (action == null || busy) {
      return
    }
    setLocal(null)
    setPin('')
    await onSendPin(passwordPanelHelper.purposeOf(action))
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (action == null || busy) {
      return
    }
    if (!sent) {
      await send()
      return
    }
    const block = passwordPanelHelper.confirmBlock(action, { pin, password, repeat })
    if (block != null) {
      setLocal(block)
      return
    }
    setLocal(null)
    if (await onConfirm(action, withPassword ? { pin, password } : { pin })) {
      reset()
    }
  }

  const updated = state === 'set' ? dateOf(status?.updatedAt, locale) : null
  const control = 'h-11 text-base'

  const summary = (() => {
    switch (state) {
      case 'loading':
        return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('password.loading', 'Loading…')}
        </p>
      case 'unreadable':
        return <div className="flex flex-col items-start gap-1 text-sm">
          <p className="text-destructive">{t('password.unreadable', "We couldn't load your password settings.")}</p>
          {onReload != null && <Button
            type="button" variant="link" data-email-password-retry className="h-11 px-0"
            onClick={() => void onReload()}
          >
            {t('password.retry', 'Try again')}
          </Button>}
        </div>
      case 'off':
        return <p data-email-password-notice className="text-sm text-muted-foreground">
          {t('password.off', 'Password sign-in is not available here. Sign in with a code sent to your email.')}
        </p>
      case 'unset':
        return <p className="text-sm">
          {t('password.unset', "You don't have a password yet. You sign in with a code sent to your email.")}
        </p>
      default:
        return <p className="text-sm">
          {t('password.set', 'You have a password.')}
          {updated != null && <> {textUtils.fill(t('password.updated', 'Last changed {{date}}.'), { date: updated })}</>}
          {status?.devicePin != null && <> <span data-email-password-device-pin={status.devicePin ? 'on' : 'off'}>
            {status.devicePin
              ? t('password.device-pin.on', 'A new device also needs a code from your email.')
              : t('password.device-pin.off', 'Your password alone signs you in on a new device.')}
          </span></>}
        </p>
    }
  })()

  return <Card data-email-password-panel data-state={state} className={className}>
    <CardHeader>
      <CardTitle>{title ?? t('password.title', 'Password')}</CardTitle>
      <CardDescription>
        {description ?? t('password.description', 'Sign in with your email and a password instead of a code.')}
      </CardDescription>
    </CardHeader>

    <CardContent className="flex flex-col gap-4">
      {summary}

      {done != null && action == null && <p role="status" data-email-password-success={done} className="text-sm">
        {done === 'device-pin'
          ? status?.devicePin === true
            ? t('password.done.device-pin-on', 'New devices now also need a code from your email.')
            : t('password.done.device-pin-off', 'Your password alone now signs you in on new devices.')
          : done === 'remove'
            ? t('password.done.remove', 'Your password has been removed.')
            : done === 'change'
              ? t('password.done.change', 'Your password has been changed.')
              : t('password.done.set', 'Your password has been set.')}
        {done !== 'device-pin' && status?.devicePin !== false && <>
          {' '}
          {t('password.devices', 'Other devices will need a code the next time they sign in.')}
        </>}
      </p>}

      {action == null && actions.length > 0 && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {actions.map(next => <Button
          key={next}
          type="button"
          variant="outline"
          data-email-password-action={next}
          className={cn(control, next === 'remove' && 'text-destructive hover:text-destructive')}
          onClick={() => open(next)}
        >
          {next === 'device-pin'
            ? status?.devicePin === true
              ? t('password.action.device-pin-off', 'Stop asking for a code on new devices')
              : t('password.action.device-pin-on', 'Ask for a code on new devices')
            : next === 'remove'
              ? t('password.action.remove', 'Remove password')
              : next === 'change'
                ? t('password.action.change', 'Change password')
                : t('password.action.set', 'Set a password')}
        </Button>)}
      </div>}

      {action != null && <form
        noValidate
        data-email-password-form={action}
        data-sent={sent ? 'true' : undefined}
        className="flex flex-col gap-4"
        onSubmit={event => void submit(event)}
      >
        <p className="text-sm text-muted-foreground">
          {action === 'device-pin'
            ? status?.devicePin === true
              ? t('password.explain.device-pin-off', "Your password alone will sign you in on a new device. Confirm it's you with a code we'll email you.")
              : t('password.explain.device-pin-on', "A new device will also need a code from your email. Confirm it's you with a code we'll email you.")
            : action === 'remove'
              ? t('password.explain.remove', "Without a password you sign in with a code sent to your email. We'll email you a code to confirm.")
              : action === 'change'
                ? t('password.explain.change', "To change your password, confirm it's you with a code we'll email you.")
                : t('password.explain.set', "To set a password, confirm it's you with a code we'll email you.")}
        </p>

        {sent && <>
          <p role="status" data-email-password-sent className="text-sm">
            {t('password.sent', 'We sent a code to your email.')}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-pin`}>{t('password.pin-label', 'Code from the email')}</Label>
            <PinInput
              id={`${id}-pin`}
              name="pin"
              data-email-password-pin
              length={EMAIL_PIN_LENGTH}
              value={pin}
              readOnly={busy}
              autoFocus
              aria-invalid={shown?.kind === 'code' || shown?.kind === 'pin-format' || undefined}
              className="max-w-60"
              onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, EMAIL_PIN_LENGTH)); setLocal(null) }}
            />
          </div>
          {withPassword && <>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-new`}>{t('password.new-label', 'New password')}</Label>
              <PasswordInput
                id={`${id}-new`}
                name="new-password"
                data-email-password-new
                autoComplete="new-password"
                maxLength={EMAIL_PASSWORD_MAX_LENGTH}
                value={password}
                readOnly={busy}
                aria-invalid={shown?.kind === 'weak' || shown?.kind === 'password-empty' || undefined}
                reveal={reveal}
                onReveal={setReveal}
                showLabel={t('login.show-password', 'Show password')}
                hideLabel={t('login.hide-password', 'Hide password')}
                toggleProps={{ 'data-email-password-toggle': '' }}
                onChange={event => { setPassword(event.target.value); setLocal(null) }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-repeat`}>{t('password.repeat-label', 'Repeat the password')}</Label>
              <PasswordInput
                id={`${id}-repeat`}
                name="repeat-password"
                data-email-password-repeat
                autoComplete="new-password"
                maxLength={EMAIL_PASSWORD_MAX_LENGTH}
                value={repeat}
                readOnly={busy}
                aria-invalid={shown?.kind === 'mismatch' || undefined}
                reveal={reveal}
                onReveal={setReveal}
                showLabel={t('login.show-password', 'Show password')}
                hideLabel={t('login.hide-password', 'Hide password')}
                onChange={event => { setRepeat(event.target.value); setLocal(null) }}
              />
            </div>
          </>}
        </>}

        <RefusalAlert refusal={shown} t={t} locale={locale} marker="data-email-password-error" className="text-left" />

        <div className="flex flex-col gap-2 sm:flex-row">
          {sent
            ? <SubmitButton
              data-email-password-confirm
              busy={busy}
              blocked={passwordPanelHelper.confirmBlock(action, { pin, password, repeat }) != null}
              className="sm:w-auto"
            >
              {busy ? t('password.confirming', 'Saving…') : t('password.confirm', 'Confirm')}
            </SubmitButton>
            : <SubmitButton data-email-password-send busy={busy} className="sm:w-auto">
              {busy ? t('password.sending', 'Sending…') : t('password.send', 'Send code')}
            </SubmitButton>}
          {sent && <Button
            type="button"
            variant="link"
            data-email-password-resend
            aria-disabled={busy || undefined}
            className={control}
            onClick={() => void send()}
          >
            {t('password.resend', 'Send a new code')}
          </Button>}
          <Button
            type="button"
            variant="ghost"
            data-email-password-cancel
            className={control}
            onClick={close}
          >
            {t('password.cancel', 'Cancel')}
          </Button>
        </div>
      </form>}
    </CardContent>
  </Card>
}
