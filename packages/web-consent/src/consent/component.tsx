import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Cookie } from 'lucide-react'
import {
  DEFAULT_CONSENT_CATEGORIES, defaultConsentTranslate, readConsent,
} from '@owlmeans/consent'
import type { ConsentRecord } from '@owlmeans/consent'
import { cn } from '../lib/utils.js'
import { useConsent } from '../hooks.js'
import { ConsentToggle } from './toggle.js'
import type { CookieConsentProps } from '../types.js'

/**
 * The cookie preferences dialog, and the button that brings it back.
 *
 * Deliberately built from raw elements rather than shadcn primitives. One of the three surfaces
 * this serves is an Astro island on a site that vendors its own component library, and requiring a
 * consumer to install a UI family in order to render a consent notice would put the notice out of
 * reach of the site that needs it most.
 */
export const CookieConsent: FC<CookieConsentProps> = props => {
  const categories = props.categories ?? DEFAULT_CONSENT_CATEGORIES
  const t = props.translate ?? defaultConsentTranslate(props.locale)

  const consent = useConsent({
    categories,
    ...(props.storageKey != null ? { storageKey: props.storageKey } : {}),
    ...(props.cookieDays != null ? { cookieDays: props.cookieDays } : {}),
    ...(props.cookieDomain != null ? { cookieDomain: props.cookieDomain } : {}),
    ...(props.silent != null ? { silent: props.silent } : {}),
  })

  const optional = categories.filter(category => category.required !== true)
  const [draft, setDraft] = useState<Record<string, boolean>>({})

  // Re-seed the draft whenever the dialog opens, from what is actually stored: a visitor who opens
  // preferences a second time must see the answer they gave, not the one the last render held.
  useEffect(() => {
    if (!consent.open) {
      return
    }
    const stored = consent.record ?? readConsent({
      ...(props.storageKey != null ? { storageKey: props.storageKey } : {}),
    })
    setDraft(Object.fromEntries(optional.map(category =>
      [category.key, stored?.[category.key] === true])))
  }, [consent.open, consent.record])

  const persist = useCallback((values: Record<string, boolean>) => {
    const record: ConsentRecord = Object.fromEntries([
      ...categories.filter(c => c.required === true).map(c => [c.key, true]),
      ...optional.map(c => [c.key, values[c.key] === true]),
    ])
    consent.save(record)
  }, [categories, consent])

  const onSave = useCallback(() => persist(draft), [draft, persist])
  const onAcceptAll = useCallback(
    () => persist(Object.fromEntries(optional.map(c => [c.key, true]))), [optional, persist]
  )

  // The dialog was raised by something that needs an answer before it can continue — signing in,
  // today. Saying so, and relabelling the primary action, is what makes the interruption make
  // sense rather than look like the page asking twice.
  const gated = consent.reason === 'login'

  return <>
    {consent.open && <div
      className="fixed inset-0 z-[999998] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-md"
      aria-modal="true" role="dialog" aria-labelledby="cc-title" aria-describedby="cc-desc"
      data-consent-dialog
    >
      <div className={cn(
        'relative z-[999999] w-full max-w-lg rounded-2xl border border-border bg-popover/95 p-6 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)] ring-1 ring-primary/20 backdrop-blur-xl sm:p-8',
        props.className
      )}>
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary to-secondary" />

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Cookie className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="cc-title" className="text-xl font-bold text-popover-foreground sm:text-2xl">
            {t('title', 'Cookie Preferences')}
          </h2>
        </div>

        <p id="cc-desc" className="mb-6 text-sm leading-relaxed text-muted-foreground">
          {t('description', 'We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic.')}
        </p>

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

        {gated && <p role="status" data-consent-reason className="mt-4 text-sm text-popover-foreground">
          {t('loginReason', 'Signing in stores a session cookie. Accept essential cookies to continue.')}
        </p>}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button
            type="button" onClick={onSave} data-consent-save
            className="flex-1 rounded-lg border border-border bg-transparent px-4 py-3 text-sm font-semibold text-popover-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >{t('savePreferences', 'Save Preferences')}</button>
          <button
            type="button" onClick={onAcceptAll} data-consent-accept-all
            className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >{gated
            ? t('acceptAndContinue', 'Accept & continue')
            : t('acceptAll', 'Accept All')}</button>
        </div>

        {(props.policyHref != null || props.links != null) && <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
          {props.policyHref != null && <a
            href={props.policyHref} target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-popover-foreground"
          >{t('policyLink', 'Cookie Policy')}</a>}
          {props.links?.map(link => <a
            key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-popover-foreground"
          >{t(link.labelKey, link.defaultLabel)}</a>)}
        </div>}
      </div>
    </div>}

    {props.noReopenButton !== true && consent.record != null && !consent.open && <button
      type="button" onClick={() => consent.openDialog('reopen')}
      aria-label={t('openPreferences', 'Cookie preferences')}
      data-consent-reopen
      className="fixed bottom-5 left-5 z-[999997] flex h-12 w-12 items-center justify-center rounded-full border border-border bg-popover text-primary shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Cookie className="h-5 w-5" aria-hidden="true" />
    </button>}
  </>
}
