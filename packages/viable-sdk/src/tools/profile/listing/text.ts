import type { ToolSplit, ToolSplitVariant } from '../types.js'
import { LISTING_BILLING_ADDRESS, LISTING_BILLING_PLACE, LISTING_RAW_TEXT, LISTING_TEXT_RULES } from './consts.local.js'
import type { ListingTextHelper } from './types.js'

/** A literal inside a regular expression. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A whole-word tool name — `attach_custom_domain` is not a mention of `custom_domain`. */
const word = (name: string): string => `(?<![A-Za-z0-9_])${literal(name)}(?![A-Za-z0-9_])`

/**
 * A listing's text rewrite over the splits it offers.
 *
 * Tool texts and their `next:` hints name the catalogue's tools — `custom_domain { action: attach,
 * domain }`, `preview_control`. A listing offers `attach_custom_domain` and `start_preview` instead,
 * so a call written with the action becomes the variant (the remaining fields kept), and a bare
 * mention becomes the variant answering — or every variant, where another tool or a notification
 * names it.
 */
export const makeListingTextHelper = (splits: readonly ToolSplit[]): ListingTextHelper => {
  const references = splits.map(split => {
    // Longest first, so one action that prefixes another is never matched short.
    const values = [...split.variants].map(variant => variant.value).sort((a, b) => b.length - a.length).map(literal)

    return {
      split,
      call: new RegExp(
        `${word(split.tool)}\\s*\\{\\s*["']?${literal(split.argument)}["']?\\s*:\\s*["']?(${values.join('|')})["']?`
        + '(?=\\s*[,}])\\s*(?:,\\s*([^{}]*?))?\\s*\\}',
        'g',
      ),
      bare: new RegExp(word(split.tool), 'g'),
    }
  })

  const variantOf = (split: ToolSplit, value: string): ToolSplitVariant | undefined =>
    split.variants.find(variant => variant.value === value)

  /** An address with what trails it as punctuation kept apart. */
  const billingFree = (text: string): string => text.replace(/https?:\/\/\S+/g, found => {
    const [, address = found, tail = ''] = /^(.*?)([.,;:)\]]*)$/.exec(found) ?? []

    return LISTING_BILLING_ADDRESS.test(address) ? `${LISTING_BILLING_PLACE}${tail}` : found
  })

  const rewrite: ListingTextHelper['rewrite'] = (text, tool) => {
    if (tool != null && LISTING_RAW_TEXT.has(tool)) return text
    let said = billingFree(LISTING_TEXT_RULES.reduce((current, rule) => current.replace(rule.pattern, rule.replace), text))
    for (const { split, call, bare } of references) {
      said = said.replace(call, (found, value: string, rest: string | undefined) => {
        const variant = variantOf(split, value)
        if (variant == null) return found
        const more = rest?.trim() ?? ''

        return more !== '' ? `${variant.name} { ${more} }` : variant.name
      })
      const own = split.variants.find(variant => variant.name === tool)
      said = said.replace(bare, own?.name ?? split.variants.map(variant => variant.name).join(' / '))
    }

    return said
  }

  return { rewrite }
}
