import type { FC, ReactNode } from 'react'
import { termsLabelResolver, termsSentence } from '@owlmeans/client-auth/login'
import type { TermsSentencePart } from '@owlmeans/client-auth/login'
import type { MarketingConsentTermsModel } from '../hooks/use-marketing-consent.js'
import type { Translate } from './inline.js'
import { ConsentRow, RequiredMark, RevisedLine } from './row.js'

export interface ConsentTermsProps {
  /** The sign-in screen's own translator (`auth` resource) — the Terms sentences are its. */
  termsT: Translate
  /** This package's own translator, for the "required" wording. */
  t: Translate
  model: MarketingConsentTermsModel
  locale?: string
}

const renderParts = (parts: TermsSentencePart[]): ReactNode =>
  parts.map((part, index) => part.href != null
    ? <a key={index} href={part.href} target="_blank" rel="noreferrer noopener"
      data-login-document={part.documentKey}
      className="underline underline-offset-2 hover:text-foreground">{part.text}</a>
    : <span key={index}>{part.text}</span>)

/**
 * The Terms confirmation, moved here from the sign-in screen
 * (`appendMarketingConsent({ terms: 'step' })`, `termsDeferred` — `@owlmeans/client-auth/login`).
 *
 * Drawn as a row of the consent list — checkbox, statement with its document links, the date the
 * documents were last revised — and marked mandatory. Same split `@owlmeans/web-panel`'s
 * `LoginTerms` makes: one consented checkbox for `documents` (terms, plus billing/product/custom
 * when configured); the disclosed-only privacy line is a SEPARATE component
 * (`ConsentPrivacyNotice`) that the screen renders in every mode, not only while a Terms row is
 * up — so it is never nested inside this checkbox's label.
 */
export const ConsentTerms: FC<ConsentTermsProps> = ({ termsT, t, model, locale }) => {
  const resolveLabel = termsLabelResolver(termsT, locale)

  return (
    <div className="flex flex-col gap-1.5">
      <ConsentRow
        // The ONLY place `data-marketing-consent-terms` appears.
        checkbox={
          <input
            type="checkbox" data-marketing-consent-terms
            data-version={model.version}
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={model.ticked}
            aria-required="true"
            aria-invalid={model.attempted && !model.ticked}
            onChange={event => model.tick(event.target.checked)}
          />
        }
        statement={<>
          {renderParts(termsSentence(
            termsT('login.terms.accept', 'I have read and agree to the {{documents}}.'),
            model, locale, resolveLabel,
          ))}
          <RequiredMark t={t} />
        </>}
        notes={model.revisedAt != null && (
          <RevisedLine
            template={termsT('login.terms.revised', 'Last updated: {{date}}')}
            date={model.revisedAt}
            datum={{ 'data-marketing-consent-terms-revised': '' }}
          />
        )}
      />

      {model.attempted && !model.ticked && (
        <p role="alert" className="text-sm text-destructive">
          {renderParts(termsSentence(
            termsT('login.terms.required', 'Please confirm the {{documents}} to continue.'),
            model, locale, resolveLabel,
          ))}
        </p>
      )}
    </div>
  )
}

export interface ConsentPrivacyNoticeProps {
  t: Translate
  model: Pick<MarketingConsentTermsModel, 'documents' | 'notices'>
  locale?: string
}

/**
 * The privacy disclosure alone — `notices` (privacy, plus cookies per its own rule), never
 * consented to. Rendered by the consent screen REGARDLESS of Terms mode, whenever the resolved
 * terms configuration carries anything to disclose (`resolved != null` — the OwlMeans defaults
 * count, so this shows unless an application explicitly turned terms off entirely).
 */
export const ConsentPrivacyNotice: FC<ConsentPrivacyNoticeProps> = ({ t, model, locale }) => {
  const resolveLabel = termsLabelResolver(t, locale)

  return (
    <p data-marketing-consent-privacy className="text-xs text-muted-foreground">
      {renderParts(termsSentence(
        t('login.terms.notice', 'How we handle your personal data: {{notices}}.'),
        model, locale, resolveLabel,
      ))}
    </p>
  )
}
