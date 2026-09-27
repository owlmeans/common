import { useState } from 'react'
import type { FC } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { MARKETING_CONSENT_I18N } from '../consts.js'
import { useMarketingConsent } from '../hooks/use-marketing-consent.js'
import { Button } from '../@/components/ui/button.js'
import { cn } from '../@/lib/utils.js'
import { ConsentFields } from './fields.js'

export interface MarketingConsentPreferencesProps {
  /** `(key, defaultValue) => string`, e.g. an app's own `useI18nApp` translator. Defaults to this
   * package's own bundle (`useI18nLib(MARKETING_CONSENT_I18N)`). */
  translate?: (key: string, defaultValue: string) => string
  className?: string
  onSaved?: () => void
}

/**
 * The SAME group/item/select-all body as `MarketingConsentScreen`, without the full-page chrome —
 * for a host's own settings card. `MarketingConsentClientService.preferences()` names the
 * entrypoint alias a "Privacy choices" footer link should point at; that screen renders this.
 *
 * Unlike the sign-in screen, there is no `useContinueLogin` here at all — this is not a step in a
 * login flow, so nothing navigates on save, and there is no "skip" — a settings card is always
 * revisitable. `useMarketingConsent({ source: 'settings' })` is what makes that true: it loads the
 * WHOLE catalogue unconditionally, never only the currently-pending items, so a fully-decided
 * account still shows every item here to change or withdraw.
 */
export const MarketingConsentPreferences: FC<MarketingConsentPreferencesProps> = ({
  translate, className, onSaved,
}) => {
  const libT = useI18nLib(MARKETING_CONSENT_I18N)
  const t = translate ?? libT
  const [locale] = useLanguage()
  const model = useMarketingConsent({ source: 'settings' })
  const [saved, setSaved] = useState(false)

  const onSave = async (): Promise<void> => {
    setSaved(false)
    const ok = await model.save()
    if (ok) {
      setSaved(true)
      onSaved?.()
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {model.loading ? (
        <p>{t('screen.loading', 'Loading…')}</p>
      ) : (
        <>
          <ConsentFields t={t} model={model} locale={locale} />

          {model.error != null && (
            <p role="alert">{t('preferences.error', "We couldn't save your choices.")}</p>
          )}
          {saved && model.error == null && <p>{t('preferences.saved', 'Saved')}</p>}

          <Button
            type="button"
            disabled={model.saving}
            data-marketing-consent-preferences-save
            onClick={() => void onSave()}
          >
            {model.saving ? t('screen.saving', 'Saving…') : t('preferences.save', 'Save')}
          </Button>
        </>
      )}
    </div>
  )
}
