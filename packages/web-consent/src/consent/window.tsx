import { useRef, useState, type FC } from 'react'
import { Cookie } from 'lucide-react'
import { consentGeoHelper, consentI18nHelper, consentStorageHelper } from '@owlmeans/consent'
import { webConsentUtils } from '../lib/utils.js'
import { ACCENT, OUTLINED, PILL } from './consts.local.js'
import { useConsentFocus } from './focus.js'
import { ConsentLinks } from './links.js'
import { ConsentToggle } from './toggle.js'
import type { ConsentWindowProps } from './types.local.js'

/**
 * The preferences window: one switch per category over a dimmed overlay, "Save Preferences" and
 * "Accept All".
 *
 * Mounted only while open, so its switches are seeded on every opening from what is actually in
 * force — a visitor who opens preferences a second time sees the answer they gave, not the one a
 * previous render held. An automatic decision past its age seeds nothing: switches that came on by
 * themselves are not a choice to present as made.
 */
export const ConsentWindow: FC<ConsentWindowProps> = props => {
  const { t, categories, domains, record, gated } = props
  const surface = useRef<HTMLDivElement>(null)
  useConsentFocus(surface, true)

  const optional = categories.filter(category => category.required !== true)
  const [draft, setDraft] = useState<Record<string, boolean>>(() => {
    const stored = record ?? consentStorageHelper.readConsent(
      props.storageKey != null ? { storageKey: props.storageKey } : {}
    )
    const seed = consentGeoHelper.autoState(stored) === 'stale' ? null : stored

    return Object.fromEntries(optional.map(category => [category.key, seed?.[category.key] === true]))
  })
  const automatic = consentGeoHelper.autoState(record) === 'fresh'

  return <div
    ref={surface} tabIndex={-1}
    className="fixed inset-0 z-[999998] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-6 outline-none"
    aria-modal="true" role="dialog" aria-labelledby="cc-title"
    aria-describedby={domains.length > 1 ? 'cc-desc cc-domains' : 'cc-desc'}
    data-consent-dialog data-consent-mode="window"
  >
    <div className={webConsentUtils.cn(
      'relative z-[999999] w-full max-w-lg rounded-3xl border border-border bg-background p-6 text-foreground sm:p-8',
      props.className
    )}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-primary">
          <Cookie className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 id="cc-title" className="text-balance text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          {t('title', 'Cookie Preferences')}
        </h2>
      </div>

      <p id="cc-desc" className="mb-6 text-pretty text-sm leading-relaxed text-muted-foreground">
        {t('description', 'We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic.')}
      </p>

      {domains.length > 1 && <p
        id="cc-domains" data-consent-domains
        className="mb-6 -mt-3 text-pretty text-xs text-muted-foreground"
      >
        {consentI18nHelper.interpolate(t('domains', 'This choice applies to {{domains}}.'), { domains: domains.join(', ') })}
      </p>}

      {automatic && <p data-consent-auto className="mb-6 -mt-3 text-pretty text-xs text-muted-foreground">
        {t('autoReason', 'These settings were applied automatically, because cookie consent is not required where you are browsing from. You can change them at any time.')}
      </p>}

      <div className="space-y-3">
        {categories.map(category => <ConsentToggle
          key={category.key}
          id={`cc-${category.key}`}
          label={t(category.labelKey, category.key)}
          description={t(category.descriptionKey, '')}
          checked={draft[category.key] === true}
          {...(category.required === true ? { required: true } : {})}
          requiredLabel={t('required', 'Required')}
          onChange={value => setDraft(current => ({ ...current, [category.key]: value }))}
        />)}
      </div>

      {gated && <p role="status" data-consent-reason className="mt-4 text-sm font-semibold text-foreground">
        {t('loginReason', 'Signing in stores a session cookie. Accept essential cookies to continue.')}
      </p>}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="button" onClick={() => props.onSave(draft)} data-consent-save
          className={webConsentUtils.cn(PILL, OUTLINED)}
        >{t('savePreferences', 'Save Preferences')}</button>
        <button
          type="button" onClick={() => props.onSave(Object.fromEntries(optional.map(c => [c.key, true])))}
          data-consent-accept-all
          className={webConsentUtils.cn(PILL, ACCENT)}
        >{gated
          ? t('acceptAndContinue', 'Accept & continue')
          : t('acceptAll', 'Accept All')}</button>
      </div>

      <ConsentLinks t={t} policyHref={props.policyHref} links={props.links} className="mt-3 justify-center" />
    </div>
  </div>
}
