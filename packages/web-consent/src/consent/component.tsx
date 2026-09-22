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
 *
 * Flat by rule, because it is the first thing every new visitor of a generated app sees: the
 * surface and every colour come from the host's theme tokens (ground, ink, muted, hairline, one
 * accent), depth comes from a hairline border and the overlay alone, and nothing paints a
 * gradient, a shadow, a glow or a `backdrop-filter`. The accept action is the one accent pill,
 * the others are outlined pills; every control is at least 44px tall and shows a 3px focus ring.
 */
/**
 * The focus ring every control here shows: 3px solid in the theme's ring colour, 3px off the
 * element. An outline rather than a box-shadow ring, so it survives a host that zeroes shadows.
 */
const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring'

/** A pill button: 44px tall at minimum, full width on a phone, sharing the row above that. */
const PILL = cn(
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-6 py-2.5 text-[15px] transition-colors motion-safe:active:scale-[0.98]',
  FOCUS
)

/** A text link: muted, underlined at rest (colour is never the only signal), 44px tall to tap. */
const LINK = cn(
  'inline-flex min-h-11 items-center font-semibold underline decoration-1 underline-offset-4 transition-colors hover:text-foreground hover:decoration-2',
  FOCUS
)

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
      className="fixed inset-0 z-[999998] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-6"
      aria-modal="true" role="dialog" aria-labelledby="cc-title" aria-describedby="cc-desc"
      data-consent-dialog
    >
      <div className={cn(
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
            type="button" onClick={onSave} data-consent-save
            className={cn(PILL, 'border-[1.5px] border-foreground bg-transparent font-semibold text-foreground hover:bg-muted')}
          >{t('savePreferences', 'Save Preferences')}</button>
          <button
            type="button" onClick={onAcceptAll} data-consent-accept-all
            className={cn(PILL, 'bg-primary font-bold text-primary-foreground hover:bg-primary/90')}
          >{gated
            ? t('acceptAndContinue', 'Accept & continue')
            : t('acceptAll', 'Accept All')}</button>
        </div>

        {(props.policyHref != null || props.links != null) && <div className="mt-3 flex flex-wrap justify-center gap-x-4 text-[13px] text-muted-foreground">
          {props.policyHref != null && <a
            href={props.policyHref} target="_blank" rel="noopener noreferrer" className={LINK}
          >{t('policyLink', 'Cookie Policy')}</a>}
          {props.links?.map(link => <a
            key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={LINK}
          >{t(link.labelKey, link.defaultLabel)}</a>)}
        </div>}
      </div>
    </div>}

    {/*
      * A bare icon, not a card: it sits in the very corner of the page for as long as a visitor
      * stays, on every page of the site, so it must read as a small fixture rather than as a
      * floating action button competing with the page's own controls. No border, no filled
      * background, no shadow and no hover-scale — only the pictogram, dimmed at rest and picked
      * out on hover/focus, at the exact size (`h-5 w-5`) it always was. The invisible hit area
      * around it is 44px, the smallest target a finger can reliably press.
      */}
    {props.noReopenButton !== true && consent.record != null && !consent.open && <button
      type="button" onClick={() => consent.openDialog('reopen')}
      aria-label={t('openPreferences', 'Cookie preferences')}
      data-consent-reopen
      className={cn('fixed bottom-1 left-1 z-[999997] inline-flex h-11 w-11 items-center justify-center rounded border-0 bg-transparent p-0 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 hover:text-primary focus-visible:opacity-100', FOCUS)}
    >
      <Cookie className="h-5 w-5" aria-hidden="true" />
    </button>}
  </>
}
