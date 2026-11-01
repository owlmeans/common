import { isValidElement, useId, type FC, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useLanguage } from '@owlmeans/client-i18n'
import { EMAIL_ADDRESS_MAX_LENGTH } from '@owlmeans/auth-email'
import { Button } from '../@/components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../@/components/ui/card.js'
import { Input } from '../@/components/ui/input.js'
import { Label } from '../@/components/ui/label.js'
import { cn } from '../@/lib/utils.js'
import { useEmailLogin } from '../hooks/use-email-login.js'
import { useEmailAuthTranslate } from '../hooks/use-translate.js'
import { emailLoginStateHelper } from '../state.js'
import { textUtils } from '../utils/text.js'
import type { EmailLoginScreenProps, Translate } from '../types.js'
import { CaptchaNotice, PasswordInput, PinInput, RefusalAlert, SubmitButton } from './fields.js'
import { EmailLoginCredit } from './credit.js'

const english: Translate = (_key, defaultValue) => defaultValue

/**
 * The e-mail sign-in card — the chooser card's twin (`@owlmeans/web-panel`'s `LoginScreen`): the
 * same centred card, logo, title, subtitle and footer slot, the same inline viewport height.
 *
 * Three steps share it: the address ("Receive authentication PIN code"), the mailed PIN, and — only
 * where the deployment offers passwords — the address with a password. Enter submits the step on
 * screen. Nothing on it is ever natively `disabled`.
 *
 * Pure with respect to i18n: `translate` is a prop (English without it), `locale` too.
 * `LocalizedEmailLoginScreen` binds both to the application's own.
 */
export const EmailLoginScreen: FC<EmailLoginScreenProps> = props => {
  const t = props.translate ?? english
  const model = useEmailLogin({ locale: props.locale })
  const { state } = model
  const id = useId()
  const busy = state.busy != null
  const Logo = props.Logo

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void model.submit()
  }

  const subtitle = props.subtitle ?? (state.step === 'password'
    ? t('login.password-subtitle', 'Sign in with your email and password.')
    : state.step === 'pin'
      ? t('login.pin-subtitle', 'Check your inbox for the code.')
      : t('login.subtitle', "We'll email you a code to sign in. New here? The same code creates your account."))

  const emailField = (autoFocus: boolean) => <div className="flex flex-col gap-2 text-left">
    <Label htmlFor={`${id}-email`}>{t('login.email-label', 'Email')}</Label>
    <Input
      id={`${id}-email`}
      name="email"
      data-email-login-email
      type="email"
      inputMode="email"
      autoComplete="username"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      maxLength={EMAIL_ADDRESS_MAX_LENGTH}
      placeholder={t('login.email-placeholder', 'you@example.com')}
      value={state.email}
      readOnly={busy}
      autoFocus={autoFocus}
      aria-invalid={state.refusal?.kind === 'email' || undefined}
      className="h-11 text-base"
      onChange={event => model.setEmail(event.target.value)}
    />
  </div>

  const link = 'h-11 px-2 text-sm'

  const step = (() => {
    switch (state.step) {
      case 'pin':
        return <form noValidate onSubmit={onSubmit} data-email-login-form="pin" className="flex flex-col gap-4">
          <p role="status" data-email-login-notice={state.notice ?? 'sent'} className="text-center text-sm">
            {state.notice === 'device'
              ? t('login.device', "We don't recognise this device. Enter the code we sent to your email.")
              : textUtils.fill(t('login.sent', 'We sent a sign-in code to {{email}}.'), {
                email: emailLoginStateHelper.normalizeEmail(state.email),
              })}
          </p>
          <div className="flex flex-col gap-2 text-left">
            <Label htmlFor={`${id}-pin`}>{t('login.pin-label', 'Code from the email')}</Label>
            <PinInput
              id={`${id}-pin`}
              name="pin"
              data-email-login-pin
              length={model.pinLength}
              value={state.pin}
              readOnly={busy}
              autoFocus
              aria-invalid={state.refusal?.kind === 'code' || state.refusal?.kind === 'pin-format' || undefined}
              onChange={event => model.setPin(event.target.value)}
            />
          </div>
          <SubmitButton
            data-email-login-submit
            data-mode="pin"
            busy={state.busy === 'sign-in'}
            blocked={emailLoginStateHelper.verifyBlock(state) != null}
          >
            {state.busy === 'sign-in' ? t('login.verifying', 'Signing in…') : t('login.verify', 'Sign in')}
          </SubmitButton>
          <div className="flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-4">
            <Button
              type="button"
              variant="link"
              data-email-login-resend
              aria-busy={state.busy === 'send' || undefined}
              className={link}
              onClick={() => void model.send()}
            >
              {state.busy === 'send' ? t('login.sending', 'Sending…') : t('login.resend', 'Send a new code')}
            </Button>
            <Button type="button" variant="link" data-email-login-change className={link} onClick={model.changeEmail}>
              {t('login.change-email', 'Change email')}
            </Button>
          </div>
        </form>

      case 'password':
        return <form noValidate onSubmit={onSubmit} data-email-login-form="password" className="flex flex-col gap-4">
          {emailField(false)}
          <div className="flex flex-col gap-2 text-left">
            <Label htmlFor={`${id}-password`}>{t('login.password-label', 'Password')}</Label>
            <PasswordInput
              id={`${id}-password`}
              name="password"
              data-email-login-password
              autoComplete="current-password"
              value={state.password}
              readOnly={busy}
              autoFocus
              aria-invalid={state.refusal?.kind === 'credentials' || state.refusal?.kind === 'password-empty'
                || undefined}
              reveal={state.reveal}
              onReveal={model.setReveal}
              showLabel={t('login.show-password', 'Show password')}
              hideLabel={t('login.hide-password', 'Hide password')}
              toggleProps={{ 'data-email-login-password-toggle': '' }}
              onChange={event => model.setPassword(event.target.value)}
            />
          </div>
          <SubmitButton
            data-email-login-submit
            data-mode="password"
            busy={state.busy === 'sign-in'}
            blocked={emailLoginStateHelper.signInBlock(state) != null}
          >
            {state.busy === 'sign-in' ? t('login.verifying', 'Signing in…') : t('login.password-submit', 'Sign in')}
          </SubmitButton>
          <Button type="button" variant="link" data-email-login-use-pin className={link} onClick={model.choosePin}>
            {t('login.use-pin', 'Sign in with a code instead')}
          </Button>
        </form>

      case 'done':
        return <p role="status" data-email-login-done className="flex items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('login.done', 'Signing you in…')}
        </p>

      default:
        return <form noValidate onSubmit={onSubmit} data-email-login-form="email" className="flex flex-col gap-4">
          {emailField(true)}
          <SubmitButton
            data-email-login-send
            busy={state.busy === 'send'}
            blocked={emailLoginStateHelper.sendBlock(state) != null}
          >
            {state.busy === 'send' ? t('login.sending', 'Sending…') : t('login.send', 'Receive authentication PIN code')}
          </SubmitButton>
          {model.passwordOffered && <Button
            type="button"
            variant="link"
            data-email-login-use-password
            className={link}
            onClick={model.choosePassword}
          >
            {t('login.use-password', 'Already set a password? Use it')}
          </Button>}
        </form>
    }
  })()

  const card = <Card data-email-login-card className={cn('w-full max-w-sm', props.containerClassName)}>
    <CardHeader className="items-center gap-2 text-center">
      {Logo != null && <div className="flex justify-center pb-2">
        {isValidElement(Logo) ? Logo : typeof Logo === 'function' ? <Logo className="h-10 w-auto" /> : Logo}
      </div>}
      <CardTitle className="text-xl">{props.title ?? t('login.title', 'Sign in with email')}</CardTitle>
      <CardDescription>{subtitle}</CardDescription>
    </CardHeader>

    <CardContent className="flex flex-col gap-4">
      {step}

      <RefusalAlert refusal={state.refusal} t={t} locale={props.locale} marker="data-email-login-error" />

      {state.optionsFailed && state.options == null && state.refusal == null
        && <div data-email-login-options-error className="flex flex-col items-center gap-1 text-center text-sm">
          <p role="alert" className="text-destructive">
            {t('login.options-failed', "We couldn't load the sign-in settings.")}
          </p>
          <Button type="button" variant="link" data-email-login-retry className={link} onClick={() => void model.retryOptions()}>
            {t('login.retry', 'Try again')}
          </Button>
        </div>}

      {model.captcha && state.step !== 'pin' && state.step !== 'done' && <CaptchaNotice t={t} />}

      {model.otherOptions != null && state.step !== 'done' && <a
        href={model.otherOptions.href}
        data-email-login-other
        className="inline-flex h-11 items-center justify-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={model.otherOptions.go}
      >
        {t('login.other', 'Other sign-in options')}
      </a>}
    </CardContent>

    <div className="px-6">
      {props.footer ?? <EmailLoginCredit t={t} />}
    </div>
  </Card>

  // The viewport height is INLINE, like the chooser's: this screen is rendered straight out of the
  // authentication route into a chain that carries no height, and a utility class new to the
  // consumer's stylesheet is exactly what a stale `@source` scan drops. `props.style` still wins.
  return <div
    data-email-login-screen
    data-step={state.step}
    data-busy={state.busy ?? undefined}
    style={{ minHeight: '100dvh', ...props.style }}
    className={cn('flex w-full items-center justify-center p-4', props.className)}
  >
    {card}
  </div>
}

/** {@link EmailLoginScreen} bound to the application's own translations and language. */
export const LocalizedEmailLoginScreen: FC<EmailLoginScreenProps> = props => {
  const t = useEmailAuthTranslate()
  const [lng] = useLanguage()

  return <EmailLoginScreen {...props} translate={props.translate ?? t} locale={props.locale ?? lng} />
}
