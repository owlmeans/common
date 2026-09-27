import type { ReactNode } from 'react'
import type { MarketingConsentDefinition } from '@owlmeans/marketing-consent'

/** `(key, defaultValue) => string` — the package's own translator, or an app's. */
export type Translate = (key: string, defaultValue: string) => string

export interface InlineLink {
  href: string
  label: string
}

/** `{{link}}` is the definition's first link, `{{link2}}` its second, and so on. */
const TOKEN = /\{\{\s*link(\d*)\s*\}\}/g

/** Whether a translated string has somewhere to put a link. */
export const carriesLinkToken = (text: string): boolean => new RegExp(TOKEN.source).test(text)

/** Text of a per-language record: the exact language, its base language, English, then anything. */
export const localized = (record: Record<string, string> | undefined, locale?: string): string | undefined => {
  if (record == null) {
    return undefined
  }
  const base = locale?.split('-')[0]

  return (locale != null ? record[locale] : undefined)
    ?? (base != null ? record[base] : undefined)
    ?? record.en
    ?? Object.values(record)[0]
}

/**
 * What a definition's links read as: a per-language label, then the label key, then the generic
 * "Learn more" — so a link is always something a person can read.
 */
export const resolveLinks = (
  definition: MarketingConsentDefinition, t: Translate, locale?: string,
): InlineLink[] => (definition.links ?? []).map(link => ({
  href: link.href,
  label: localized(link.label, locale)
    || (link.labelKey != null ? t(link.labelKey, '') : '')
    || t('link.default', 'Learn more'),
}))

const anchorOf = (link: InlineLink, key: number): ReactNode => (
  <a
    key={key} href={link.href} target="_blank" rel="noreferrer noopener"
    data-marketing-consent-link=""
    className="underline underline-offset-2 hover:text-foreground"
  >{link.label}</a>
)

const tokensOf = (text: string): number[] =>
  Array.from(text.matchAll(TOKEN)).map(match => (match[1] === '' ? 1 : Number(match[1])))

/**
 * A translated string with its link placeholders drawn as anchors — the same technique the sign-in
 * screen's terms sentence uses, so the link is part of the sentence in every language, wherever
 * that language wants it.
 *
 * A placeholder with no link behind it draws nothing. With `dropSentence` it also takes its whole
 * sentence away — "described in the ." reads as a fault, and a definition configured without links
 * is a normal thing to be — which is right for a description and wrong for a statement, whose words
 * are what the person agrees to.
 */
export const inlineLinks = (template: string, links: InlineLink[], dropSentence = false): ReactNode => {
  const kept = dropSentence
    ? template
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => tokensOf(sentence).every(index => links[index - 1] != null))
      .join(' ')
    : template

  const parts = kept.split(TOKEN)
  if (parts.length === 1) {
    return kept
  }

  // `split` with a capture group interleaves: text, token digits, text, token digits, …
  return parts.map((part, index) => {
    if (index % 2 === 0) {
      return part
    }
    const link = links[(part === '' ? 1 : Number(part)) - 1]

    return link != null ? anchorOf(link, index) : null
  })
}

export interface RowText {
  /** What the person agrees to. */
  statement: ReactNode
  /** The detail under it, when there is any. */
  detail: ReactNode | null
}

/**
 * The words of one consent row: the statement and its detail, from the definition's i18n keys or —
 * for a custom entry without keys — its per-language text, with the links inside.
 *
 * A definition that has links but whose text has no placeholder for them still shows one: it is
 * appended to the detail, so the link is part of the sentence's block rather than a stray anchor.
 */
export const rowTextOf = (
  definition: MarketingConsentDefinition, t: Translate, locale?: string,
): RowText => {
  const links = resolveLinks(definition, t, locale)
  const label = definition.labelKey != null
    ? t(definition.labelKey, definition.key)
    : localized(definition.label, locale) ?? definition.key
  const description = definition.descriptionKey != null
    ? t(definition.descriptionKey, '')
    : localized(definition.description, locale) ?? ''

  const placed = carriesLinkToken(label) || carriesLinkToken(description)
  const drawn = description === '' ? '' : inlineLinks(description, links, true)
  const body = drawn === '' ? null : drawn

  if (placed || links.length === 0) {
    return { statement: inlineLinks(label, links), detail: body }
  }

  return {
    statement: label,
    detail: <>{body}{body != null ? ' ' : ''}{anchorOf(links[0], 0)}</>,
  }
}
