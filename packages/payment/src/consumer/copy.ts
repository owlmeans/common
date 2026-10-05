import { LIB_NAMESPACE, resolveI18nResource } from '@owlmeans/i18n'
import '../i18n.js'
import { ConsentKind, CONSUMER_RIGHTS_RESOURCE } from '../consts.js'
import { ConsumerRightsError } from '../errors.js'
import type { ProductPlan } from '../types.js'
import { consumerRightsPolicyHelper } from './policy.js'
import type { ConsentStatement, CopyTree, CopyValues, LegalLabels } from './types.js'
import type { ConsumerCopyHelper } from './copy/types.js'

const isTree = (value: unknown): value is CopyTree =>
  value != null && typeof value === 'object' && !Array.isArray(value)

export const createConsumerCopyHelper = (): ConsumerCopyHelper => {
  const merge = (base: CopyTree, over: Record<string, unknown>): CopyTree => {
    const result: CopyTree = { ...base }
    for (const [key, value] of Object.entries(over)) {
      const current = result[key]
      if (isTree(value)) {
        result[key] = merge(isTree(current) ? current : {}, value)
      } else if (typeof value === 'string') {
        result[key] = value
      }
    }

    return result
  }

  const resolve = (lng: string): Record<string, unknown> | null =>
    resolveI18nResource(lng, CONSUMER_RIGHTS_RESOURCE, LIB_NAMESPACE)

  const consumerRightsCopy = (lng: string): CopyTree => {
    const base = consumerRightsPolicyHelper.baseLanguageOf(lng)
    let copy = merge({}, resolve('en') ?? {})
    if (base !== '' && base !== 'en') {
      copy = merge(copy, resolve(base) ?? {})
    }
    if (lng !== base && lng.trim() !== '') {
      copy = merge(copy, resolve(lng) ?? {})
    }

    return copy
  }

  const textAt = (copy: CopyTree, path: string): string | undefined => {
    const value = path.split('.').reduce<unknown>((node, key) => isTree(node) ? node[key] : undefined, copy)

    return typeof value === 'string' ? value : undefined
  }

  const consumerText = (lng: string, path: string, vars: CopyValues = {}, context?: string): string => {
    const copy = consumerRightsCopy(lng)
    const variant = context != null && context !== '' ? `${path}_${context}` : null
    const key = variant != null && textAt(copy, variant) != null ? variant : path
    const value = textAt(copy, key)
    if (value == null) {
      throw new ConsumerRightsError(`copy:${path}`)
    }

    return value.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, name: string) => {
      const filled = vars[name]
      if (filled == null) {
        throw new ConsumerRightsError(`copy:${key}:${name}`)
      }

      return String(filled)
    })
  }

  const placeholdersOf = (text: string): string[] =>
    [...new Set([...text.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map(match => match[1]))]

  const legalLabelsOf = (lng: string): LegalLabels => ({
    withdrawal: {
      function: consumerText(lng, 'withdrawal.function'),
      confirm: consumerText(lng, 'withdrawal.confirm'),
    },
    cancellation: {
      function: consumerText(lng, 'cancellation.function'),
      confirm: consumerText(lng, 'cancellation.confirm'),
    },
  })

  const startContextOf = (plan: Pick<ProductPlan, 'withdrawal'> | null | undefined): 'units' | undefined =>
    plan?.withdrawal?.components?.some(component => component.basis === 'units') === true ? 'units' : undefined

  const consentStatementOf = (
    lng: string, kind: ConsentKind, vars: { trader: string, plan?: string, context?: string },
  ): ConsentStatement => {
    const branch = kind === ConsentKind.SubscriptionStart ? 'subscription-start' : 'performance-consent'
    const values: CopyValues = { trader: vars.trader, ...(vars.plan != null ? { plan: vars.plan } : {}) }

    return {
      request: consumerText(lng, `${branch}.request`, values, vars.context),
      acknowledgement: consumerText(lng, `${branch}.acknowledgement`, values, vars.context),
      checkbox: consumerText(lng, `${branch}.checkbox`, values, vars.context),
    }
  }

  return { consumerRightsCopy, consumerText, placeholdersOf, legalLabelsOf, startContextOf, consentStatementOf }
}

export const consumerCopyHelper = createConsumerCopyHelper()

/** @deprecated compat:factory-refactor — use `consumerCopyHelper.consumerRightsCopy(…)` */
export const consumerRightsCopy = (lng: string): CopyTree => consumerCopyHelper.consumerRightsCopy(lng)

/** @deprecated compat:factory-refactor — use `consumerCopyHelper.consumerText(…)` */
export const consumerText = (lng: string, path: string, vars?: CopyValues, context?: string): string =>
  consumerCopyHelper.consumerText(lng, path, vars, context)

/** @deprecated compat:factory-refactor — use `consumerCopyHelper.legalLabelsOf(…)` */
export const legalLabelsOf = (lng: string): LegalLabels => consumerCopyHelper.legalLabelsOf(lng)

/** @deprecated compat:factory-refactor — use `consumerCopyHelper.startContextOf(…)` */
export const startContextOf = (plan: Pick<ProductPlan, 'withdrawal'> | null | undefined): 'units' | undefined =>
  consumerCopyHelper.startContextOf(plan)

/** @deprecated compat:factory-refactor — use `consumerCopyHelper.consentStatementOf(…)` */
export const consentStatementOf = (
  lng: string, kind: ConsentKind, vars: { trader: string, plan?: string, context?: string },
): ConsentStatement => consumerCopyHelper.consentStatementOf(lng, kind, vars)
