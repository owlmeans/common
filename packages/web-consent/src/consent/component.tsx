import { useCallback, type FC } from 'react'
import { Cookie } from 'lucide-react'
import { DEFAULT_CONSENT_CATEGORIES, type ConsentRecord, consentI18nHelper } from '@owlmeans/consent'
import { webConsentUtils } from '../lib/utils.js'
import { useConsent } from '../hooks.js'
import { CONSENT_DEFAULT_MODE } from '../consts.js'
import type { CookieConsentProps } from '../types.js'
import { ConsentBar } from './bar.js'
import { ConsentLocatingOverlay } from './locating.js'
import { ConsentWindow } from './window.js'
import { FOCUS } from './consts.local.js'

/**
 * The cookie-consent UI of a document: one of three surfaces at a time, and the corner button.
 *
 * - While a first-time visitor is being located (`geo`), a transparent overlay with a spinner.
 * - The first ask (`reason: 'initial'`) in `bar` mode — the default — the bar.
 * - Every other opening, and the first ask in `window` mode, the preferences window.
 *
 * Mounted once, at the application root, outside the router: a surface mounted in a route is torn
 * down by the first navigation. The bar and the window share one save path, so whichever answers,
 * the record carries every required category on and exactly the optional ones chosen.
 */
export const CookieConsent: FC<CookieConsentProps> = props => {
  const categories = props.categories ?? DEFAULT_CONSENT_CATEGORIES
  const t = props.translate ?? consentI18nHelper.defaultConsentTranslate(props.locale)
  const mode = props.mode ?? CONSENT_DEFAULT_MODE

  const consent = useConsent({
    categories,
    ...(props.storageKey != null ? { storageKey: props.storageKey } : {}),
    ...(props.cookieDays != null ? { cookieDays: props.cookieDays } : {}),
    ...(props.cookieDomain != null ? { cookieDomain: props.cookieDomain } : {}),
    ...(props.silent != null ? { silent: props.silent } : {}),
    ...(props.linker != null ? { linker: props.linker } : {}),
    ...(props.geo != null ? { geo: props.geo } : {}),
  })
  const domains = webConsentUtils.disclosedDomains(props.linker)
  const optional = categories.filter(category => category.required !== true)

  const persist = useCallback((values: Record<string, boolean>) => {
    const record: ConsentRecord = Object.fromEntries([
      ...categories.filter(c => c.required === true).map(c => [c.key, true]),
      ...optional.map(c => [c.key, values[c.key] === true]),
    ])
    consent.save(record)
  }, [categories, consent])

  const surface = consent.open
    ? mode === 'bar' && consent.reason === 'initial' ? 'bar' : 'window'
    : consent.locating === 'first' ? 'locating' : null

  return <>
    {surface === 'locating' && <ConsentLocatingOverlay t={t} />}

    {surface === 'bar' && <ConsentBar
      t={t} categories={categories} domains={domains}
      policyHref={props.policyHref} links={props.links} barClassName={props.barClassName}
      onPreferences={() => consent.openDialog('preferences')}
      onMandatory={() => persist({})}
      onAcceptAll={() => persist(Object.fromEntries(optional.map(c => [c.key, true])))}
    />}

    {/*
      * Keyed by the reason it opened for, so a window raised again for a different reason (the
      * sign-in gate over a visitor already in preferences) re-seeds instead of keeping a stale draft.
      */}
    {surface === 'window' && <ConsentWindow
      key={consent.reason ?? 'window'}
      t={t} categories={categories} domains={domains} record={consent.record}
      {...(props.storageKey != null ? { storageKey: props.storageKey } : {})}
      gated={consent.reason === 'login'}
      policyHref={props.policyHref} links={props.links} className={props.className}
      onSave={persist}
    />}

    {/*
      * A bare icon, not a card: it sits in the very corner of the page for as long as a visitor
      * stays, on every page of the site, so it must read as a small fixture rather than as a
      * floating action button competing with the page's own controls. No border, no filled
      * background, no shadow and no hover-scale — only the pictogram, dimmed at rest and picked
      * out on hover/focus, at the exact size (`h-5 w-5`) it always was. The invisible hit area
      * around it is 44px, the smallest target a finger can reliably press.
      */}
    {props.noReopenButton !== true && consent.record != null && !consent.open && consent.locating == null && <button
      type="button" onClick={() => consent.openDialog('reopen')}
      aria-label={t('openPreferences', 'Cookie preferences')}
      data-consent-reopen
      className={webConsentUtils.cn('fixed bottom-1 left-1 z-[999997] inline-flex h-11 w-11 items-center justify-center rounded border-0 bg-transparent p-0 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 hover:text-primary focus-visible:opacity-100', FOCUS)}
    >
      <Cookie className="h-5 w-5" aria-hidden="true" />
    </button>}
  </>
}
