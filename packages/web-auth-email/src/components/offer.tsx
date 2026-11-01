import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { RoutedComponent } from '@owlmeans/client'
import { useContext } from '@owlmeans/client'
import { useLanguage } from '@owlmeans/client-i18n'
import { useContinueLogin } from '@owlmeans/client-auth/login'
import {
  EMAIL_LOGIN_SERVICE, EMAIL_PASSWORD_MAX_LENGTH, EMAIL_PASSWORD_MIN_LENGTH,
} from '@owlmeans/auth-email'
import { logger } from '@owlmeans/log'
import { Button } from '../@/components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../@/components/ui/card.js'
import { Label } from '../@/components/ui/label.js'
import { EMAIL_OFFER_LOGIN_STEP } from '../consts.js'
import { useEmailAuthTranslate } from '../hooks/use-translate.js'
import { passwordPanelHelper } from '../password.js'
import { emailRefusalHelper } from '../refusal.js'
import { emailStorageHelper } from '../storage.js'
import { textUtils } from '../utils/text.js'
import { signedInAccount } from '../utils/account.js'
import type { EmailRefusal } from '../refusal/types.js'
import type { EmailLoginClientService } from '../types.js'
import { PasswordInput, RefusalAlert, SubmitButton } from './fields.js'

const log = logger('auth-email')

/**
 * The post-sign-in offer: "Set a password for faster sign-in", right after a PIN sign-in of a
 * person who has none and never declined one. The fresh sign-in's one-use ticket confirms it — no
 * second PIN. "Not now" declines (the step is not offered again); both answers forget the ticket
 * and move the sign-in on to the next step or the landing.
 */
export const PasswordOfferScreen: RoutedComponent = () => {
  const t = useEmailAuthTranslate()
  const [locale] = useLanguage()
  const ctx = useContext()
  const continueLogin = useContinueLogin()
  const id = useId()

  const client = ctx.service<EmailLoginClientService>(EMAIL_LOGIN_SERVICE)
  const ticket = useMemo(() => emailStorageHelper.offer(signedInAccount(ctx)), [ctx])

  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState<'save' | 'skip' | null>(null)
  const [refusal, setRefusal] = useState<EmailRefusal | null>(null)
  const advanced = useRef(false)

  const advance = async (): Promise<void> => {
    if (advanced.current) {
      return
    }
    advanced.current = true
    emailStorageHelper.dropOffer()
    await continueLogin({ after: EMAIL_OFFER_LOGIN_STEP })
  }

  // Nothing to offer on this visit (a reload after the answer, an expired ticket): move on.
  useEffect(() => {
    if (ticket == null) {
      void advance()
    }
  }, [ticket])

  const save = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    if (busy != null || ticket == null) {
      return
    }
    const block = passwordPanelHelper.passwordBlock(password, repeat)
    if (block != null) {
      setRefusal(block)
      return
    }
    setBusy('save')
    setRefusal(null)
    try {
      await client.setPassword({ password, offer: ticket, device: emailStorageHelper.deviceId() })
      await advance()
    } catch (error) {
      const next = emailRefusalHelper.refusalOf(error, 'offer')
      log.debug('Password offer refused', { kind: next.kind })
      if (next.kind === 'offer-expired') {
        emailStorageHelper.dropOffer()
      }
      setRefusal(next)
      setBusy(null)
    }
  }

  const skip = async (): Promise<void> => {
    if (busy != null) {
      return
    }
    setBusy('skip')
    try {
      await client.declinePassword()
    } catch (error) {
      // Declining is a courtesy to the next sign-in; failing it must not hold this one up.
      log.debug('Password offer decline failed', { kind: emailRefusalHelper.refusalOf(error, 'offer').kind })
    }
    await advance()
  }

  const mismatch = refusal?.kind === 'mismatch'

  return <div
    data-email-offer-screen
    style={{ minHeight: '100dvh' }}
    className="flex w-full items-center justify-center p-4"
  >
    <Card
      data-email-offer
      data-state={ticket == null ? 'leaving' : busy ?? 'ready'}
      className="w-full max-w-sm"
    >
      <CardHeader className="items-center gap-2 text-center">
        <CardTitle className="text-xl">{t('offer.title', 'Set a password for faster sign-in')}</CardTitle>
        <CardDescription>
          {t('offer.description', 'Next time, sign in with your email and password instead of waiting for a code.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={event => void save(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 text-left">
            <Label htmlFor={`${id}-password`}>{t('offer.password-label', 'New password')}</Label>
            <PasswordInput
              id={`${id}-password`}
              name="new-password"
              data-email-offer-password
              autoComplete="new-password"
              autoFocus
              maxLength={EMAIL_PASSWORD_MAX_LENGTH}
              value={password}
              readOnly={busy != null}
              aria-invalid={refusal?.kind === 'weak' || refusal?.kind === 'password-empty' || undefined}
              aria-describedby={`${id}-hint`}
              reveal={reveal}
              onReveal={setReveal}
              showLabel={t('login.show-password', 'Show password')}
              hideLabel={t('login.hide-password', 'Hide password')}
              toggleProps={{ 'data-email-offer-toggle': '' }}
              onChange={event => { setPassword(event.target.value); setRefusal(null) }}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {textUtils.fill(t('offer.hint', '{{min}} to {{max}} characters.'), {
                min: EMAIL_PASSWORD_MIN_LENGTH, max: EMAIL_PASSWORD_MAX_LENGTH,
              })}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-left">
            <Label htmlFor={`${id}-repeat`}>{t('offer.repeat-label', 'Repeat the password')}</Label>
            <PasswordInput
              id={`${id}-repeat`}
              name="repeat-password"
              data-email-offer-repeat
              autoComplete="new-password"
              maxLength={EMAIL_PASSWORD_MAX_LENGTH}
              value={repeat}
              readOnly={busy != null}
              aria-invalid={mismatch || undefined}
              reveal={reveal}
              onReveal={setReveal}
              showLabel={t('login.show-password', 'Show password')}
              hideLabel={t('login.hide-password', 'Hide password')}
              onChange={event => { setRepeat(event.target.value); setRefusal(null) }}
            />
          </div>

          <RefusalAlert refusal={refusal} t={t} locale={locale} marker="data-email-offer-error" />

          <SubmitButton
            data-email-offer-save
            busy={busy === 'save'}
            blocked={ticket == null || passwordPanelHelper.passwordBlock(password, repeat) != null}
          >
            {busy === 'save' ? t('offer.saving', 'Saving…') : t('offer.save', 'Save password')}
          </SubmitButton>
          <Button
            type="button"
            variant="outline"
            data-email-offer-skip
            aria-disabled={busy != null || undefined}
            aria-busy={busy === 'skip' || undefined}
            className="h-11 w-full text-base"
            onClick={() => void skip()}
          >
            {t('offer.skip', 'Not now')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t('offer.later', 'You can always set a password later in your account settings.')}
          </p>
        </form>
      </CardContent>
    </Card>
  </div>
}
