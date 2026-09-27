import { Fragment, useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@owlmeans/client-i18n'
import { baseLanguageOf } from '@owlmeans/payment'
import type { ConsumerRightsLinks } from '@owlmeans/payment'
import { cn } from '@/lib/utils'
import { languageNameOf, usePaymentText, type FixedText } from './copy.js'
import type { LegalLinksSource, PieceError } from './types.js'

/** The interface language: the one given, else the active i18n language. */
export const useUiLanguage = (uiLanguage?: string): string => {
  const [active] = useLanguage()

  return baseLanguageOf(uiLanguage ?? active) || 'en'
}

export interface ShownLanguage {
  /** The language the legal copy is shown in now (base code). */
  shown: string
  /** The contract language (base code). */
  contract: string
  ui: string
  /** The contract and interface languages differ, so a toggle is offered. */
  canToggle: boolean
  toggle: () => void
}

/**
 * Which language a legal text is shown in: the contract language first, with a toggle to the
 * interface language and back. `resetKey` (the dialog's `open`, say) returns it to the contract
 * language.
 */
export const useShownLanguage = (contractLanguage: string, uiLanguage?: string, resetKey?: unknown): ShownLanguage => {
  const ui = useUiLanguage(uiLanguage)
  const contract = baseLanguageOf(contractLanguage) || ui
  const [showUi, setShowUi] = useState(false)
  useEffect(() => { setShowUi(false) }, [contract, resetKey])
  const canToggle = contract !== ui
  const toggle = useCallback(() => setShowUi(value => !value), [])

  return { shown: canToggle && showUi ? ui : contract, contract, ui, canToggle, toggle }
}

export interface LanguageToggleProps {
  language: ShownLanguage
  /** An extra `data-*` hook of the piece that hosts the toggle (`data-consent-language-toggle`). */
  hook?: string
  className?: string
}

/**
 * Switches a legal text between the contract and the interface language. Phrased in the
 * INTERFACE language ("Show in German") — the reader who needs the toggle reads that one.
 */
export const LanguageToggle = ({ language, hook, className }: LanguageToggleProps) => {
  const ui = usePaymentText(language.ui)
  if (!language.canToggle) {
    return null
  }
  const target = language.shown === language.contract ? language.ui : language.contract

  return <button
    type="button" onClick={language.toggle} data-language-toggle="" data-target-language={target}
    {...(hook != null ? { [hook]: '' } : {})}
    className={cn('text-primary w-fit cursor-pointer text-xs underline-offset-4 hover:underline', className)}
  >
    {ui('consumer.show-in', { language: languageNameOf(target, language.ui) })}
  </button>
}

/** The links of the shown language: the source's, else the view's own. */
export const linksFor = (language: string, own: ConsumerRightsLinks | undefined, source?: LegalLinksSource): ConsumerRightsLinks | undefined => {
  if (source == null) {
    return own
  }
  const picked = typeof source === 'function'
    ? source(language)
    : source[language] ?? source[baseLanguageOf(language)]

  return picked ?? own
}

export interface LegalLinksProps {
  links?: ConsumerRightsLinks
  legal: FixedText
  onWithdraw?: () => void
  className?: string
}

/**
 * "Billing Terms · Withdrawal information · Withdraw from contract here", each in the shown
 * language: `[data-legal-link="billing-terms" | "withdrawal-information" | "withdrawal-function"]`.
 * The withdrawal function is a button when the application opens it in-app (`onWithdraw`), else a
 * link to its public page, else absent.
 */
export const LegalLinks = ({ links, legal, onWithdraw, className }: LegalLinksProps) => {
  const anchor = (key: string, href: string | undefined, label: string) => href == null || href === ''
    ? null
    : <a key={key} href={href} target="_blank" rel="noopener noreferrer" data-legal-link={key}
      className="text-primary underline-offset-4 hover:underline">{label}</a>
  const items = [
    anchor('billing-terms', links?.billingTerms, legal('links.billing-terms')),
    anchor('withdrawal-information', links?.withdrawalInformation, legal('links.withdrawal-information')),
    onWithdraw != null
      ? <button key="withdrawal-function" type="button" onClick={onWithdraw} data-legal-link="withdrawal-function"
        className="text-primary cursor-pointer underline-offset-4 hover:underline">{legal('links.withdrawal-function')}</button>
      : anchor('withdrawal-function', links?.withdrawalFunction, legal('links.withdrawal-function')),
  ].filter(item => item != null)
  if (items.length === 0) {
    return null
  }

  return <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', className)} data-legal-links="">
    {items.map((item, index) => <Fragment key={index}>
      {index > 0 && <span aria-hidden="true" className="text-muted-foreground">·</span>}
      {item}
    </Fragment>)}
  </p>
}

/** A piece's failure line: the application's own words, or the generic sentence for `true`. */
export const ErrorLine = ({ error, text }: { error?: PieceError, text: FixedText }) => {
  if (error == null || error === false) {
    return null
  }

  return <p role="alert" className="text-destructive text-sm" data-consumer-error="">
    {error === true ? text('consumer.failed') : error}
  </p>
}
