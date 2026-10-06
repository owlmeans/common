import type { ReactNode } from 'react'
import type { MarketingConsentDefinition } from '@owlmeans/marketing-consent'
import { TOKEN } from './consts.local.js'
import type { InlineLink, RowText, Translate } from './types.js'
import type { InlineHelper } from './inline/types.js'

export const createInlineHelper = (): InlineHelper => {
  const carriesLinkToken = (text: string): boolean => new RegExp(TOKEN.source).test(text)

  const localized = (record: Record<string, string> | undefined, locale?: string): string | undefined => {
    if (record == null) {
      return undefined
    }
    const base = locale?.split('-')[0]

    return (locale != null ? record[locale] : undefined)
      ?? (base != null ? record[base] : undefined)
      ?? record.en
      ?? Object.values(record)[0]
  }

  const resolveLinks = (
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

  const inlineLinks = (template: string, links: InlineLink[], dropSentence = false): ReactNode => {
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

  const rowTextOf = (
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

  return { carriesLinkToken, localized, resolveLinks, inlineLinks, rowTextOf }
}

export const inlineHelper = createInlineHelper()
