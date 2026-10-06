import { httpStatusOf } from '@owlmeans/api/status'
import { ConsentKind, consentRefusalOf } from '@owlmeans/payment'
import { MAX_DEPTH, NESTED_FIELDS, PRECONDITION_REQUIRED } from './consts.local.js'
import { ConsentDeclined } from './errors.js'
import type { ConsentRefusalHelper } from './refusal/types.js'

export const createConsentRefusalHelper = (): ConsentRefusalHelper => {
  const consentRefusalKindOf = (error: unknown): ConsentKind | 'unknown' | null => {
    let status = false
    const seen = new Set<unknown>()
    const visit = (value: unknown, depth: number): ConsentKind | null => {
      if (value == null || depth > MAX_DEPTH) {
        return null
      }
      if (typeof value === 'string') {
        const holder = { message: value }
        if (httpStatusOf(holder) === PRECONDITION_REQUIRED) status = true
        return consentRefusalOf(holder)
      }
      if (typeof value !== 'object' || seen.has(value)) {
        return null
      }
      seen.add(value)
      const kind = consentRefusalOf(value)
      if (kind != null) {
        return kind
      }
      if (httpStatusOf(value) === PRECONDITION_REQUIRED) {
        status = true
      }
      for (const field of NESTED_FIELDS) {
        const nested = visit((value as Record<string, unknown>)[field], depth + 1)
        if (nested != null) return nested
      }
      const errors = (value as { errors?: unknown }).errors
      if (Array.isArray(errors)) {
        for (const item of errors) {
          const nested = visit(item, depth + 1)
          if (nested != null) return nested
        }
      }

      return null
    }
    const kind = visit(error, 0)

    return kind ?? (status ? 'unknown' : null)
  }

  const isConsentRefusal = (error: unknown): boolean => consentRefusalKindOf(error) != null

  const isPerformanceConsentRefusal = (error: unknown): boolean => {
    const kind = consentRefusalKindOf(error)

    return kind === ConsentKind.Performance || kind === 'unknown'
  }

  const isConsentDeclined = (error: unknown): error is ConsentDeclined => error instanceof ConsentDeclined

  return { consentRefusalKindOf, isConsentRefusal, isPerformanceConsentRefusal, isConsentDeclined }
}

export const consentRefusalHelper = createConsentRefusalHelper()

/** @deprecated compat:factory-refactor — use `consentRefusalHelper.consentRefusalKindOf(…)` */
export const consentRefusalKindOf = (error: unknown): ConsentKind | 'unknown' | null =>
  consentRefusalHelper.consentRefusalKindOf(error)

/** @deprecated compat:factory-refactor — use `consentRefusalHelper.isPerformanceConsentRefusal(…)` */
export const isPerformanceConsentRefusal = (error: unknown): boolean =>
  consentRefusalHelper.isPerformanceConsentRefusal(error)
