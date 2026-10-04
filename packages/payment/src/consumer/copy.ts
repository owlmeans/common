import { LIB_NAMESPACE, resolveI18nResource } from '@owlmeans/i18n'
import '../i18n.js'
import { ConsentKind, CONSUMER_RIGHTS_RESOURCE } from '../consts.js'
import { ConsumerRightsError } from '../errors.js'
import type { ProductPlan } from '../types.js'
import { baseLanguageOf } from './policy.js'

/** A copy bundle: nested keys, string leaves. */
export interface CopyTree {
  [key: string]: string | CopyTree
}

const isTree = (value: unknown): value is CopyTree =>
  value != null && typeof value === 'object' && !Array.isArray(value)

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

/**
 * The consumer-rights copy of one language — the `payment-consumer-rights` bundles as registered
 * (the package's own, merged under any application override made with
 * `addI18nApp(lng, 'payment-consumer-rights', data, { ns: LIB_NAMESPACE })`), key by key over the
 * English ones so a missing key still reads. Any language, independent of the active i18next
 * language and without draining a bundle: this is what a server renders e-mails and paygate
 * texts from, and what a dialog shows in the billing country's language.
 */
export const consumerRightsCopy = (lng: string): CopyTree => {
  const base = baseLanguageOf(lng)
  let copy = merge({}, resolve('en') ?? {})
  if (base !== '' && base !== 'en') {
    copy = merge(copy, resolve(base) ?? {})
  }
  if (lng !== base && lng.trim() !== '') {
    copy = merge(copy, resolve(lng) ?? {})
  }

  return copy
}

export type CopyValues = Record<string, string | number>

const textAt = (copy: CopyTree, path: string): string | undefined => {
  const value = path.split('.').reduce<unknown>((node, key) => isTree(node) ? node[key] : undefined, copy)

  return typeof value === 'string' ? value : undefined
}

/**
 * One text of the copy at a dot path (`withdrawal.function`), its `{{name}}` placeholders filled.
 * Values are inserted as given — escape them for the medium (HTML) before passing them in.
 *
 * With a `context`, the variant `<path>_<context>` is read first and the base `path` only where the
 * copy has no such variant — the i18next context suffix (`performance-consent.request_included`).
 *
 * @throws ConsumerRightsError `copy:<path>` when the path is not a text, `copy:<path>:<name>` when a
 * placeholder has no value — a legal text is never sent with a hole in it.
 */
export const consumerText = (lng: string, path: string, vars: CopyValues = {}, context?: string): string => {
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

/** The placeholders a text of the copy expects, in order of first appearance. */
export const placeholdersOf = (text: string): string[] =>
  [...new Set([...text.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map(match => match[1]))]

export interface LegalLabels {
  withdrawal: { function: string, confirm: string }
  cancellation: { function: string, confirm: string }
}

/**
 * The statutory button labels of one language — the withdrawal function (CRD Art. 11a; § 356a
 * BGB; L221-21) and the cancellation function (§ 312k BGB; L215-1-1). Shown in the language of the
 * billing country, whatever the interface language.
 */
export const legalLabelsOf = (lng: string): LegalLabels => ({
  withdrawal: {
    function: consumerText(lng, 'withdrawal.function'),
    confirm: consumerText(lng, 'withdrawal.confirm'),
  },
  cancellation: {
    function: consumerText(lng, 'cancellation.function'),
    confirm: consumerText(lng, 'cancellation.confirm'),
  },
})

export interface ConsentStatement {
  request: string
  acknowledgement: string
  /** The checkbox text: the request and the acknowledgement together. */
  checkbox: string
}

/**
 * The copy variant of a plan's subscription start statement — the one place it is decided.
 *
 * `'units'` exactly when the plan's `withdrawal.components` declare a `units` part: the statement
 * then names the split (the services pro rata by time, the right of withdrawal expiring for the
 * included units used) — the `_units` texts. Otherwise (no components, or `time` parts only: the
 * whole price pro rata by the days elapsed) `undefined`, the base texts.
 */
export const startContextOf = (plan: Pick<ProductPlan, 'withdrawal'> | null | undefined): 'units' | undefined =>
  plan?.withdrawal?.components?.some(component => component.basis === 'units') === true ? 'units' : undefined

/**
 * The express request of one consent kind in one language, rendered — what the dialog shows, the
 * server records and the confirmation e-mail repeats verbatim. `trader` names the business;
 * `plan` (the plan's title) is required for a subscription start; `context` picks the
 * `_<context>` variant of each text that has one — the policy's `consentContext` for the
 * performance consent, `startContextOf(plan)` for a subscription start.
 */
export const consentStatementOf = (
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
