import { useContext } from '@owlmeans/client'
import type { RoutedComponent } from '@owlmeans/client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { OAUTH_I18N } from '../consts.js'
import { useOAuthConsent } from '../hooks/use-oauth-consent.js'
import { Button } from '../@/components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../@/components/ui/card.js'

/**
 * The device/authorization-code consent screen. Full-page, no application chrome — the same
 * shape `/dispatcher` and `/iam/interact/:uid` already render in, because a sign-in round trip is
 * never a panel inside the application's own navigation.
 *
 * The screen refuses to render when framed: a device or code approval is exactly the click a
 * clickjacking overlay would want to steal, and nothing about this decision needs to happen
 * inside a frame.
 */
export const OAuthConsentScreen: RoutedComponent = () => {
  const context = useContext()
  const [query] = context.router().useSearchParams()
  const ref = query.get('ref')
  const t = useI18nLib(OAUTH_I18N, 'consent')
  const { stage, view, errorKind, approve, deny, switchAccount } = useOAuthConsent(ref)

  const framed = typeof window !== 'undefined' && window.top !== window.self

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 440 }} data-testid="oauth-consent-card">
        {framed ? (
          <CardContent>
            <p role="alert">{t('framed')}</p>
          </CardContent>
        ) : stage === 'checking' || stage === 'signing-in' ? (
          <CardContent>
            <p>{t('checking')}</p>
          </CardContent>
        ) : stage === 'loading' ? (
          <CardContent>
            <p>{t('loading')}</p>
          </CardContent>
        ) : stage === 'error' ? (
          <CardContent>
            <p role="alert" data-testid="oauth-consent-error">{t(errorKind == null || errorKind === 'failed' ? 'error' : `error-${errorKind}`)}</p>
          </CardContent>
        ) : view != null ? (
          <>
            <CardHeader>
              <CardTitle data-testid="oauth-consent-client">{t('title', { client: view.client.name })}</CardTitle>
              <CardDescription>
                {view.client.origin === 'cimd' && view.client.host != null
                  ? t('known-by-host', { host: view.client.host })
                  : view.client.origin === 'dcr'
                    ? t('unverified')
                    : t('known')}
              </CardDescription>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {view.userCode != null && (
                <p data-testid="oauth-consent-code">{t('device-code', { code: view.userCode })}</p>
              )}
              {view.deviceName != null && <p>{t('device-name', { name: view.deviceName })}</p>}
              {view.redirectHost != null && <p>{t('redirect-host', { host: view.redirectHost })}</p>}
              {view.localhostOnly === true && (
                <p role="alert">{t('localhost-warning')}</p>
              )}
              <p>{t('scope', { scopes: view.scopes.join(', ') })}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button
                  type="button" variant="outline" disabled={stage === 'deciding'}
                  data-testid="oauth-consent-deny" onClick={() => void deny()}
                >
                  {t('deny')}
                </Button>
                <Button
                  type="button" disabled={stage === 'deciding'}
                  data-testid="oauth-consent-approve" onClick={() => void approve()}
                  autoFocus
                >
                  {t('approve')}
                </Button>
              </div>
              <Button
                type="button" variant="link" size="sm" disabled={stage === 'deciding'}
                data-testid="oauth-consent-switch" onClick={() => void switchAccount()}
              >
                {t('switch-account')}
              </Button>
            </CardContent>
          </>
        ) : null}
      </Card>
    </div>
  )
}
