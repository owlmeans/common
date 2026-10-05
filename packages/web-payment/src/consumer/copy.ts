import { LIB_NAMESPACE, resolveI18nResource } from '@owlmeans/i18n'
import { consumerCopyHelper, consumerRightsPolicyHelper, type CopyValues } from '@owlmeans/payment'
import { WEB_PAYMENT_RESOURCE } from '../consts.js'
import type { Tree } from './types.local.js'
import type { FixedText, LegalText } from './types.js'
import type { FixedTextHelper } from './copy/types.js'

const isTree = (value: unknown): value is Tree =>
  value != null && typeof value === 'object' && !Array.isArray(value)

export const createFixedTextHelper = (): FixedTextHelper => {
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
    const base = consumerRightsPolicyHelper.baseLanguageOf(lng)
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

  const paymentTextOf = (lng: string): FixedText => {
    const tree = bundleOf(lng)

    return (key, values) => {
      const value = key.split('.').reduce<unknown>((node, part) => isTree(node) ? node[part] : undefined, tree)

      return typeof value === 'string' ? fill(value, values) : key
    }
  }

  const legalTextOf = (lng: string): LegalText => (path, values, context) => {
    try {
      return consumerCopyHelper.consumerText(lng, path, values, context)
    } catch {
      try {
        return consumerCopyHelper.consumerText('en', path, values, context)
      } catch {
        return ''
      }
    }
  }

  const languageNameOf = (lng: string, inLanguage: string): string => {
    try {
      return new Intl.DisplayNames([inLanguage], { type: 'language' }).of(lng) ?? lng
    } catch {
      return lng
    }
  }

  return { paymentTextOf, legalTextOf, languageNameOf }
}

export const fixedTextHelper = createFixedTextHelper()

/** @deprecated compat:factory-refactor — use `fixedTextHelper.paymentTextOf(…)` */
export const paymentTextOf = (lng: string): FixedText => fixedTextHelper.paymentTextOf(lng)

/** @deprecated compat:factory-refactor — use `fixedTextHelper.legalTextOf(…)` */
export const legalTextOf = (lng: string): LegalText => fixedTextHelper.legalTextOf(lng)
