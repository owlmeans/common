import type { ReactNode } from 'react'
import type { MarketingConsentDefinition } from '@owlmeans/marketing-consent'
import type { InlineLink, RowText, Translate } from '../types.js'

/** A consent row's words with the definition's links drawn inside the translated sentences. */
export interface InlineHelper {
  /** Whether a translated string has somewhere to put a link. */
  carriesLinkToken: (text: string) => boolean
  /** Text of a per-language record: the exact language, its base language, English, then anything. */
  localized: (record: Record<string, string> | undefined, locale?: string) => string | undefined
  /**
   * What a definition's links read as: a per-language label, then the label key, then the generic
   * "Learn more" — so a link is always something a person can read.
   */
  resolveLinks: (definition: MarketingConsentDefinition, t: Translate, locale?: string) => InlineLink[]
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
  inlineLinks: (template: string, links: InlineLink[], dropSentence?: boolean) => ReactNode
  /**
   * The words of one consent row: the statement and its detail, from the definition's i18n keys or —
   * for a custom entry without keys — its per-language text, with the links inside.
   *
   * A definition that has links but whose text has no placeholder for them still shows one: it is
   * appended to the detail, so the link is part of the sentence's block rather than a stray anchor.
   */
  rowTextOf: (definition: MarketingConsentDefinition, t: Translate, locale?: string) => RowText
}
