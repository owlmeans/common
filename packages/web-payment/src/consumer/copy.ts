import { useMemo } from 'react'
import { LIB_NAMESPACE, resolveI18nResource } from '@owlmeans/i18n'
import { baseLanguageOf, consumerText } from '@owlmeans/payment'
import type { CopyValues } from '@owlmeans/payment'
import { WEB_PAYMENT_RESOURCE } from '../i18n.js'

interface Tree {
  [key: string]: string | Tree
}

const isTree = (value: unknown): value is Tree =>
  value != null && typeof value === 'object' && !Array.isArray(value)

const merge = (base: Tree, over: Record<string, unknown> | null): Tree => {
  const result: Tree = { ...base }
  for (const [key, value] of Object.entries(over ?? {})) {
    if (isTree(value)) {
      const current = result[key]
      result[key] = merge(isTree(current) ? current : {}, value)
    } else if (typeof value === 'string') {
      result[key] = value
    }
  }

  return result
}

const bundleOf = (lng: string): Tree => {
  const base = baseLanguageOf(lng)
  let tree = merge({}, resolveI18nResource('en', WEB_PAYMENT_RESOURCE, LIB_NAMESPACE))
  if (base !== '' && base !== 'en') {
    tree = merge(tree, resolveI18nResource(base, WEB_PAYMENT_RESOURCE, LIB_NAMESPACE))
  }
  if (lng !== base && lng.trim() !== '') {
    tree = merge(tree, resolveI18nResource(lng, WEB_PAYMENT_RESOURCE, LIB_NAMESPACE))
  }

  return tree
}

const fill = (text: string, values: CopyValues = {}): string =>
  text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, name: string) => values[name] != null ? String(values[name]) : '')

/** A translator bound to ONE language, whatever the active i18n language is. */
export type FixedText = (key: string, values?: CopyValues) => string

/**
 * The package's own interface strings (`web-payment`, library tier, any application override
 * included) in a FIXED language, merged key by key over English — no i18next instance and no
 * draining (`resolveI18nResource`). What lets a consumer-rights dialog render wholly in the
 * contract language while the rest of the page stays in the interface language.
 */
export const paymentTextOf = (lng: string): FixedText => {
  const tree = bundleOf(lng)

  return (key, values) => {
    const value = key.split('.').reduce<unknown>((node, part) => isTree(node) ? node[part] : undefined, tree)

    return typeof value === 'string' ? fill(value, values) : key
  }
}

/**
 * The legal copy of `@owlmeans/payment` (`payment-consumer-rights`) in a fixed language. A text
 * that cannot be rendered in the language (a broken application override) falls back to English
 * rather than blanking the page; one that cannot be rendered at all is `''`.
 */
export const legalTextOf = (lng: string): FixedText => (path, values) => {
  try {
    return consumerText(lng, path, values)
  } catch {
    try {
      return consumerText('en', path, values)
    } catch {
      return ''
    }
  }
}

/** `paymentTextOf(lng)`, memoised for the language. */
export const usePaymentText = (lng: string): FixedText => useMemo(() => paymentTextOf(lng), [lng])

/** `legalTextOf(lng)`, memoised for the language. */
export const useLegalText = (lng: string): FixedText => useMemo(() => legalTextOf(lng), [lng])

/** A language's own name in another language (`de` in `en` → "German"); the code when unknown. */
export const languageNameOf = (lng: string, inLanguage: string): string => {
  try {
    return new Intl.DisplayNames([inLanguage], { type: 'language' }).of(lng) ?? lng
  } catch {
    return lng
  }
}
