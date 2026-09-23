import type { FC, ReactNode } from 'react'
import { cn } from '../../@/lib/utils.js'
import type { LoginTermsModel } from '@owlmeans/client-panel/auth'
import { termsSentence } from '@owlmeans/client-auth/login'
import type { ResolvedTermsDocument, TermsSentencePart } from '@owlmeans/client-auth/login'

export interface LoginTermsProps {
  model: LoginTermsModel
  translate: (key: string, defaultValue: string) => string
  /** The current language, for `Intl.ListFormat` and a document's own locale-keyed label. */
  locale?: string
  className?: string
}

/**
 * English fallbacks for a document's own translated label, keyed by `ResolvedTermsDocument.key`.
 *
 * Only the keys this package's own resolver ever produces need one — a custom document always
 * carries its own `label`/`labelMap`, or a caller's own `i18nKey` with its own bundle entry.
 */
const DEFAULT_LABEL: Record<string, string> = {
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  billing: 'Billing Terms',
  product: '{{product}} Product Terms',
}

/**
 * A document's own label: a caller's literal `label`, else its `labelMap` for the current locale,
 * else its `i18nKey` translated — each with `params` (e.g. `{ product: 'Acme' }`) interpolated
 * afterwards, since the `translate` contract this whole package shares is a plain
 * `(key, defaultValue) => string` with no interpolation option of its own.
 */
const resolveLabelFor = (
  translate: (key: string, defaultValue: string) => string, locale: string | undefined
) => (doc: ResolvedTermsDocument): string => {
  const fromMap = doc.labelMap != null
    ? (locale != null ? doc.labelMap[locale] : undefined) ?? Object.values(doc.labelMap)[0]
    : undefined
  let label = doc.label ?? fromMap
    ?? (doc.i18nKey != null ? translate(doc.i18nKey, DEFAULT_LABEL[doc.key] ?? doc.key) : doc.key)

  if (doc.params != null) {
    for (const [key, value] of Object.entries(doc.params)) {
      label = label.split(`{{${key}}}`).join(value)
    }
  }

  return label
}

const renderParts = (parts: TermsSentencePart[]): ReactNode =>
  parts.map((part, index) => part.href != null
    ? <a key={index} href={part.href} target="_blank" rel="noreferrer noopener"
      data-login-document={part.documentKey}
      className="underline underline-offset-2 hover:text-foreground">{part.text}</a>
    : <span key={index}>{part.text}</span>)

/**
 * The sign-in screen's terms confirmation: one consented checkbox for `documents` (terms, plus
 * billing/product/custom when configured), and a SEPARATE, non-consented disclosure line for
 * `notices` (privacy, plus cookies per its own rule) — never nested inside the checkbox's label,
 * because nothing is being agreed to there.
 */
export const LoginTerms: FC<LoginTermsProps> = ({ model, translate, locale, className }) => {
  const resolveLabel = resolveLabelFor(translate, locale)

  // Centred, like every other row in the card. The checkbox stays at the start of the sentence
  // rather than above it, so `justify-center` centres the pair and `text-center` centres the
  // wrapped lines within it.
  return <div className={cn('flex flex-col items-center gap-1.5 text-center', className)}>
    {/*
      The ONLY place `data-login-terms` appears — an e2e suite in the consuming product treats it
      as a strict (exactly-one-match) locator, so it must never be duplicated onto a second control.
    */}
    <label className="flex items-start justify-center gap-2 text-sm text-muted-foreground cursor-pointer">
      {/*
        A NATIVE checkbox, deliberately. `web-panel` ships no `checkbox` primitive, and requiring
        every consumer to vendor one plus its Radix peer to render a sign-in screen would be a
        breaking change for every application already on this package. A native control is also the
        most accessible thing available here.
      */}
      <input
        type="checkbox" data-login-terms
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={model.accepted}
        aria-invalid={model.attempted && !model.accepted}
        onChange={event => model.accept(event.target.checked)}
      />
      <span>
        {renderParts(termsSentence(
          translate('login.terms.accept', 'I have read and agree to the {{documents}}.'),
          model, locale, resolveLabel
        ))}
      </span>
    </label>

    {model.revisedAt != null && <p data-login-revised className="text-xs text-muted-foreground">
      {translate('login.terms.revised', 'Last updated: {{date}}').split('{{date}}').join(model.revisedAt)}
    </p>}

    {/*
      Outside the checkbox's `<label>` on purpose: a privacy disclosure is not something the
      checkbox consents to, so it is a sibling paragraph rather than nested inside it.
    */}
    <p data-login-privacy className="text-xs text-muted-foreground">
      {renderParts(termsSentence(
        translate('login.terms.notice', 'How we handle your personal data: {{notices}}.'),
        model, locale, resolveLabel
      ))}
    </p>

    {model.attempted && !model.accepted && <p role="alert" className="text-sm text-destructive">
      {renderParts(termsSentence(
        translate('login.terms.required', 'Please confirm the {{documents}} to continue.'),
        model, locale, resolveLabel
      ))}
    </p>}
  </div>
}
