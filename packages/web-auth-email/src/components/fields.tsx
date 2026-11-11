import type { FC } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '../@/components/ui/button.js'
import { Input } from '../@/components/ui/input.js'
import { cn } from '../@/lib/utils.js'
import { captchaNoticeHelper } from '@owlmeans/web-captcha'
import { emailRefusalHelper } from '../refusal.js'
import { textUtils } from '../utils/text.js'
import type {
  CaptchaNoticeProps, PasswordInputProps, PinInputProps, RefusalAlertProps, SubmitButtonProps,
} from './types.js'

/**
 * A password field with its show/hide toggle inside the box. The toggle is a real button with an
 * accessible name that says what it will do, and a 44px target.
 */
export const PasswordInput: FC<PasswordInputProps> = ({
  reveal, onReveal, showLabel, hideLabel, toggleProps, className, ...props
}) => (
  <div className="relative">
    <Input
      {...props}
      type={reveal ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className={cn('h-11 pr-12 text-base', className)}
    />
    <Button
      type="button"
      variant="ghost"
      {...toggleProps}
      aria-label={reveal ? hideLabel : showLabel}
      aria-pressed={reveal}
      title={reveal ? hideLabel : showLabel}
      className="absolute inset-y-0 right-0 h-11 w-11 rounded-l-none text-muted-foreground hover:text-foreground"
      onClick={() => onReveal(!reveal)}
    >
      {reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
    </Button>
  </div>
)

/** The PIN field: numeric keypad on a phone, the mailed code offered by the keyboard's autofill. */
export const PinInput: FC<PinInputProps> = ({ length, className, ...props }) => (
  <Input
    {...props}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9]*"
    maxLength={length}
    className={cn('h-12 text-center font-mono text-2xl tracking-[0.4em]', className)}
  />
)

/**
 * The step's primary action. Never the HTML `disabled` attribute: a disabled button swallows the
 * press and tells nobody anything, so a blocked or busy action carries `aria-disabled` and its
 * handler explains (or ignores the second press).
 */
export const SubmitButton: FC<SubmitButtonProps> = ({ busy, blocked = false, className, children, ...props }) => (
  <Button
    type="submit"
    {...props}
    aria-disabled={busy || blocked || undefined}
    aria-busy={busy || undefined}
    data-blocked={blocked ? 'true' : undefined}
    className={cn('h-11 w-full gap-2 text-base', (busy || blocked) && 'opacity-60', className)}
  >
    {busy && <Loader2 className="animate-spin" aria-hidden />}
    {children}
  </Button>
)

/** A refusal in the reader's language, announced as it appears. */
export const RefusalAlert: FC<RefusalAlertProps> = ({ refusal, t, locale, marker, className }) => refusal == null
  ? null
  : <p
    role="alert"
    {...{ [marker]: '' }}
    data-refusal={refusal.kind}
    className={cn('text-center text-sm text-destructive', className)}
  >
    {emailRefusalHelper.messageOf(refusal, t, locale)}
  </p>

/**
 * The captcha provider's notice: a client that hides its provider's badge ships the sentence a page
 * then has to show, with its links, in the reader's language. The client's text is the default of
 * `captcha.<key>`, so an application may still override it. Nothing for a client that needs none.
 */
export const CaptchaNotice: FC<CaptchaNoticeProps> = ({ t, client, locale, className }) => {
  const notice = captchaNoticeHelper.noticeOf(client, locale)
  if (notice == null) {
    return null
  }
  const links = Object.fromEntries(Object.entries(notice.links).map(([name, link]) =>
    [name, { text: t(`captcha.${name}`, link.text), href: link.href }]))
  const parts = textUtils.parts(t('captcha.notice', notice.sentence), links)

  return <p data-email-login-captcha className={cn('text-center text-xs text-muted-foreground', className)}>
    {parts.map((part, index) => part.href != null
      ? <a
        key={index}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >{part.text}</a>
      : <span key={index}>{part.text}</span>)}
  </p>
}
