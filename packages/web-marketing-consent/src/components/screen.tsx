import { useI18nLib } from '@owlmeans/client-i18n'
import type { RoutedComponent } from '@owlmeans/client'
import { useContinueLogin } from '@owlmeans/client-auth/login'
import { MARKETING_CONSENT_I18N, MARKETING_CONSENT_LOGIN_STEP } from '../consts.js'
import { useMarketingConsent } from '../hooks/use-marketing-consent.js'
import { Button } from '../@/components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../@/components/ui/card.js'
import { ConsentFields } from './fields.js'

/**
 * The post-sign-in marketing-consent screen. Full page, no application chrome — the same shape
 * `@owlmeans/web-oauth`'s consent screen renders in.
 *
 * UNLIKE that screen, this one renders when framed too: saving a marketing preference is not a
 * token-mint decision a clickjacking overlay could steal, so there is deliberately no
 * framed-refusal branch here.
 */
export const MarketingConsentScreen: RoutedComponent = () => {
  const t = useI18nLib(MARKETING_CONSENT_I18N)
  const model = useMarketingConsent({ source: 'sign-in' })
  const continueLogin = useContinueLogin()

  const onSave = async (): Promise<void> => {
    const ok = await model.save()
    if (ok) {
      await continueLogin({ after: MARKETING_CONSENT_LOGIN_STEP })
    }
  }

  // A person who cannot or will not answer must never be permanently trapped on this step — skip
  // clears the error and moves the flow on exactly as a successful save would, just unsaved.
  const onSkip = async (): Promise<void> => {
    model.skip()
    await continueLogin({ after: MARKETING_CONSENT_LOGIN_STEP })
  }

  return (
    <div
      data-marketing-consent
      style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <CardHeader>
          <CardTitle>{t('screen.title', 'Your privacy choices')}</CardTitle>
          <CardDescription>
            {t('screen.subtitle', 'Choose what we may use to reach you and personalize your experience.')}
          </CardDescription>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {model.loading ? (
            <p>{t('screen.loading', 'Loading…')}</p>
          ) : (
            <>
              <ConsentFields t={t} model={model} />

              {model.error != null && (
                <p role="alert" data-marketing-consent-error>
                  {t('screen.error', "We couldn't save your choices.")}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  type="button"
                  disabled={model.saving}
                  data-marketing-consent-save
                  onClick={() => void onSave()}
                >
                  {model.saving ? t('screen.saving', 'Saving…') : t('screen.save', 'Save and continue')}
                </Button>

                {model.error != null && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    data-marketing-consent-skip
                    onClick={() => void onSkip()}
                  >
                    {t('screen.skip', 'Continue without saving')}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
