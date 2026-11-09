import { AuthRefused } from '@owlmeans/auth'
import { apiStatusHelper } from '@owlmeans/api/status'
import { LoginFailureKind } from './failure/consts.js'
import {
  BACK_COPY, FAILURE_COPY, INCIDENT_COPY, INCIDENT_PLACEHOLDER, REFUSAL_CODES, RETRY_COPY,
} from './failure/consts.local.js'
import type { LoginFailure, LoginFailureHelper, LoginFailurePhrase } from './failure/types.js'
import type { LoginTranslate } from './types.js'

export const createLoginFailureHelper = (): LoginFailureHelper => {
  const english: LoginTranslate = (_key, defaultValue) => defaultValue

  /** The message and type a caught value carries — a non-object carries none. */
  const textOf = (error: unknown): string => {
    if (error == null || typeof error !== 'object') {
      return typeof error === 'string' ? error : ''
    }
    const { message, type } = error as { message?: unknown, type?: unknown }

    return [message, type].filter((part): part is string => typeof part === 'string').join(' ')
  }

  const codeOf = (error: unknown): LoginFailureKind | null => {
    const text = textOf(error)

    return REFUSAL_CODES.find(([marker]) => marker.test(text))?.[1] ?? null
  }

  /** `AuthRefused` of this or another module copy: `instanceof` answers across copies by type name. */
  const isRefusedClass = (error: unknown): boolean =>
    error instanceof AuthRefused
    || (error != null && typeof error === 'object' && (error as { type?: unknown }).type === AuthRefused.typeName)

  const failureOf = (error: unknown): LoginFailure => {
    const kind = codeOf(error)
      ?? (isRefusedClass(error) || apiStatusHelper.isAccessDenied(error) ? LoginFailureKind.Refused : LoginFailureKind.Failed)
    const [key, fallback] = FAILURE_COPY[kind]

    return {
      kind,
      refused: kind !== LoginFailureKind.Failed,
      key,
      fallback,
      incidentId: apiStatusHelper.incidentIdOf(error),
    }
  }

  const isRefusal = (error: unknown): boolean => failureOf(error).refused

  const phrase = (failure: LoginFailure, translate: LoginTranslate = english): LoginFailurePhrase => {
    const [actionKey, actionFallback] = failure.refused ? BACK_COPY : RETRY_COPY
    // A refusal is the person's condition, not an incident to report: no reference line.
    const incident = !failure.refused && failure.incidentId != null
      ? translate(INCIDENT_COPY[0], INCIDENT_COPY[1]).split(INCIDENT_PLACEHOLDER).join(failure.incidentId)
      : null

    return {
      message: translate(failure.key, failure.fallback),
      incident,
      action: translate(actionKey, actionFallback),
    }
  }

  return { failureOf, isRefusal, phrase }
}

export const loginFailureHelper = createLoginFailureHelper()
