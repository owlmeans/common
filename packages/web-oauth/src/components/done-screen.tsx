import { useContext } from '@owlmeans/client'
import type { RoutedComponent } from '@owlmeans/client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { OAUTH_I18N } from '../consts.js'
import { Card, CardContent, CardHeader, CardTitle } from '../@/components/ui/card.js'

/**
 * The final screen of the device grant — the moment the person's part is finished and the MCP's
 * poll is expected to catch up within the device-authorization's own poll interval. There is
 * nothing here to click and nowhere further to go; the tab's only remaining job is to be closed.
 */
export const OAuthDoneScreen: RoutedComponent = () => {
  const context = useContext()
  const [query] = context.router().useSearchParams()
  const t = useI18nLib(OAUTH_I18N, 'done')
  const kind = query.get('kind')

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 380, textAlign: 'center' }} data-testid="oauth-done-card">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{kind === 'device' ? t('device-message') : t('message')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
