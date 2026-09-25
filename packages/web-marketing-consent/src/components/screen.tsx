import { useEffect, useRef } from 'react'
import type { FC } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import type { RoutedComponent } from '@owlmeans/client'
import { useContinueLogin, useLogout } from '@owlmeans/client-auth/login'
import { AUTH_I18N, MARKETING_CONSENT_I18N, MARKETING_CONSENT_LOGIN_STEP } from '../consts.js'
import { useMarketingConsent } from '../hooks/use-marketing-consent.js'
import { Button } from '../@/components/ui/button.js'
import { cn } from '../@/lib/utils.js'
import { ConsentFields } from './fields.js'
import { ConsentPrivacyNotice } from './terms.js'

export interface MarketingConsentBodyProps {
  className?: string
}

/**
 * Everything the post-sign-in marketing-consent step does, and none of the page around it — the
 * host owns that. Put it in whatever layout the application has (its own header, a language
 * switcher, a card of the width its copy needs); `MarketingConsentScreen` below is the plain frame
 * for an application that has none.
 *
 * It renders nothing at all once there is nothing left to answer (the flow moves on by itself), so
 * a host frame that should vanish with it hides itself while empty (`empty:hidden`).
 *
 * Five states, in order:
 * 1. **loading** — the status read is outstanding.
 * 2. **Terms mode, unconfirmed** (`terms.needed`) — the Terms row is the first row of the list,
 *    marked mandatory, with any pending items below it. Confirm is `aria-disabled` until ticked;
 *    there is no Skip while this row is up.
 * 3. **optional-only** — only optional items are pending. Confirm is always clickable (a save with
 *    nothing changed is a valid decision) but looks muted, with a hint, until the person changes
 *    ANYTHING (a tick, an untick, Select-all) — after that it reads as an ordinary primary action.
 *    Skip is always offered here.
 * 4. **unreadable, nothing else to show** — the status could not be read at all and there is no
 *    Terms row to fall back on (default mode): one sentence and Skip.
 * 5. **nothing pending** — the flow moves on by itself; nothing renders.
 *
 * The privacy disclosure (`ConsentPrivacyNotice`) renders in EVERY state that shows content at
 * all, in both Terms mode and default mode — it was never something the checkbox consented to, so
 * deferring that checkbox here does not change where the disclosure belongs.
 *
 * UNLIKE `@owlmeans/web-oauth`'s consent screen this one renders when framed too: saving a
 * marketing preference is not a token-mint decision a clickjacking overlay could steal, so there is
 * deliberately no framed-refusal branch.
 */
export const MarketingConsentBody: FC<MarketingConsentBodyProps> = ({ className }) => {
  const t = useI18nLib(MARKETING_CONSENT_I18N)
  // The Terms/privacy sentences are the SIGN-IN SCREEN's own (`login.terms.*`, resource `auth`) —
  // a separate translator, never `t` above, which is scoped to this package's own `marketing-
  // consent` resource and would resolve those keys to nothing.
  const tAuth = useI18nLib(AUTH_I18N)
  const [locale] = useLanguage()
  const model = useMarketingConsent({ source: 'sign-in', locale })
  const continueLogin = useContinueLogin()
  const onLogOut = useLogout()

  const pending = model.groups.length > 0
  const termsBlocked = model.terms.needed && !model.terms.ticked
  const showHint = model.optionalOnly && model.pristine
  const showSkip = !model.loading && !model.terms.needed
  const showSignOut = model.terms.needed || (model.loading && model.deferred)
  const showPrivacy = !model.loading && (model.terms.notices.length > 0)
  // The Terms confirmation is on this screen (or about to be, while the status is still loading in
  // Terms mode) — the lead-in then asks for it first, where without it the screen only asks for
  // consents.
  const termsMode = model.terms.needed || (model.loading && model.deferred)
  // Nothing left to confirm and the read that would say so actually succeeded — move on without
  // making the person click anything. Guarded against firing twice (StrictMode, a re-render while
  // `continueLogin`'s own async work is still in flight).
  const done = !model.loading && !model.unreadable && !model.terms.needed && !pending
  const advanced = useRef(false)

  useEffect(() => {
    if (done && !advanced.current) {
      advanced.current = true
      void continueLogin({ after: MARKETING_CONSENT_LOGIN_STEP })
    }
  }, [done, continueLogin])

  const onSave = async (): Promise<void> => {
    const ok = await model.save()
    if (ok) {
      await continueLogin({ after: MARKETING_CONSENT_LOGIN_STEP })
    }
  }

  // A person who cannot or will not answer must never be permanently trapped on this step — skip
  // clears the error and moves the flow on exactly as a successful save would, just unsaved. Never
  // offered while a Terms row is up: that confirmation is the one thing this step does not wave
  // through unconfirmed.
  const onSkip = async (): Promise<void> => {
    await model.skip()
    await continueLogin({ after: MARKETING_CONSENT_LOGIN_STEP })
  }

  if (done) {
    return null
  }

  return (
    <div
      data-marketing-consent
      data-state={model.loading ? 'loading' : 'ready'}
      className={cn('flex flex-col gap-6', className)}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold leading-tight">{t('screen.title', 'Agreements and consents')}</h1>
        <p data-marketing-consent-subtitle={termsMode ? 'terms' : 'consents'} className="text-sm text-muted-foreground">
          {termsMode
            ? t(
              'screen.subtitle-terms',
              'Confirm the terms and conditions to continue, and choose how we may contact you and how your data may be used.',
            )
            : t('screen.subtitle', 'Choose how we may contact you and how your data may be used.')}
        </p>
      </div>

      {model.loading ? (
        <p>{t('screen.loading', 'Loading…')}</p>
      ) : (
        <>
          {showPrivacy && <ConsentPrivacyNotice t={tAuth} model={model.terms} locale={locale} />}

          {(pending || model.terms.needed) && (
            <ConsentFields t={t} termsT={tAuth} model={model} locale={locale} />
          )}

          {/* Two different moments, one sentence: an initial read that never came back
              (`unreadable`, only reachable here with nothing else on screen to fall back on —
              a Terms row or pending items would already have been shown instead), or a later
              `save()` that failed (`model.error`, set only once items were actually posted). */}
          {(model.error != null || (model.unreadable && !pending && !model.terms.needed)) && (
            <p role="alert" data-marketing-consent-error>
              {t('screen.error', "We couldn't save your choices.")}
            </p>
          )}

          {model.termsError != null && (
            <p role="alert" data-marketing-consent-terms-error>
              {t('screen.terms-error', "We couldn't confirm the Terms. Please try again.")}
            </p>
          )}

          {showHint && (
            <p id="marketing-consent-hint" data-marketing-consent-hint className="text-xs text-muted-foreground">
              {t('screen.hint', 'You can continue without changing anything.')}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant={termsBlocked || showHint ? 'outline' : 'default'}
              disabled={model.saving}
              data-marketing-consent-save
              data-blocked={termsBlocked ? 'true' : undefined}
              data-empty={showHint ? 'true' : undefined}
              aria-disabled={termsBlocked || undefined}
              aria-describedby={showHint ? 'marketing-consent-hint' : undefined}
              className={cn(termsBlocked && 'opacity-60')}
              onClick={() => void onSave()}
            >
              {model.saving ? t('screen.saving', 'Saving…') : t('screen.save', 'Save and continue')}
            </Button>

            {showSkip && (
              <>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  data-marketing-consent-skip
                  onClick={() => void onSkip()}
                >
                  {t('screen.skip', 'Skip for now')}
                </Button>
                <p data-marketing-consent-skip-note className="text-xs text-muted-foreground">
                  {t('screen.skip-note', 'We will ask again the next time you sign in.')}
                </p>
              </>
            )}

            {showSignOut && (
              <Button
                type="button"
                variant="link"
                size="sm"
                data-marketing-consent-signout
                onClick={onLogOut}
              >
                {t('screen.signout', 'Sign out')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The plain frame around `MarketingConsentBody`: a centered card up to 768px wide, hidden while the
 * body renders nothing. The screen an application binds when it has no layout of its own for this
 * step; one that has binds its own component around `MarketingConsentBody` instead.
 */
export const MarketingConsentScreen: RoutedComponent = () => (
  <div className="flex min-h-dvh items-center justify-center p-4">
    <div className="w-full max-w-3xl rounded-xl border bg-card p-6 text-card-foreground shadow-sm empty:hidden">
      <MarketingConsentBody />
    </div>
  </div>
)
