import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useContext, useNavigate } from '@owlmeans/client'
import type { RoutedComponent } from '@owlmeans/client'
import { useI18nLib } from '@owlmeans/client-i18n'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { makeFlowModel } from '@owlmeans/flow'
import { normalizeUserCode, oauthFlow, OAuthFlowStep, OAUTH_PAYLOAD_REF } from '@owlmeans/oauth'
import { OAUTH_I18N } from '../consts.js'
import { Button } from '../@/components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../@/components/ui/card.js'
import { Input } from '../@/components/ui/input.js'
import { Label } from '../@/components/ui/label.js'

/**
 * The device-verification screen (RFC 8628's `verification_uri`). Opened by the MCP, either bare
 * (a person types the code they were shown) or complete (`?user_code=…`, already carrying it).
 *
 * Either way it goes through the SAME flow transition — `verify` → `next` → `consent` — so the
 * two entry shapes converge onto one path before anything else runs.
 */
export const OAuthDeviceScreen: RoutedComponent = () => {
  const context = useContext()
  const nav = useNavigate()
  const [query] = context.router().useSearchParams()
  const t = useI18nLib(OAUTH_I18N, 'device')
  const [code, setCode] = useState(query.get('user_code') ?? '')

  const proceed = useCallback(async (typed: string) => {
    const model = await makeFlowModel(oauthFlow)
    model.enter(OAuthFlowStep.Verify)
    model.updatePayload({ [OAUTH_PAYLOAD_REF]: normalizeUserCode(typed) })
    model.transit('next', true)
    const destination = model.step()
    await nav.navigate(
      context.entrypoint<ClientEntrypoint<string>>(destination.module!), { query: model.payload() }
    )
  }, [nav])

  const initial = query.get('user_code')
  const complete = initial != null && initial !== ''

  useEffect(() => {
    if (complete) void proceed(initial)
  }, [complete, initial])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void proceed(code)
  }

  if (complete) {
    return null
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 380 }} data-testid="oauth-device-card">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label htmlFor="oauth-device-code">{t('code-label')}</Label>
              <Input
                id="oauth-device-code" data-testid="oauth-device-input" autoComplete="off"
                placeholder="XXXX-XXXX" value={code}
                onChange={event => setCode(event.target.value)}
              />
            </div>
            <Button type="submit" data-testid="oauth-device-submit" disabled={code.trim() === ''}>
              {t('continue')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
