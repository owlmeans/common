import type { ErrorObject } from 'ajv'
import { LlmModelError, LlmOutputRejection, LlmSchemaRejection } from '../errors.js'
import {
  CORRECTION_HEADER, CORRECTION_INSTRUCTION, CORRECTION_VALUE_LABEL, FILTER_REJECTED, MAX_CORRECTION_ERRORS,
  MAX_FRAGMENT_CHARS, ROOT_PATH_LABEL, VALIDATION_FAILED, VALIDATION_SUMMARY_ERRORS,
} from './refusal/consts.js'
import type { RefusalUtils } from './refusal/types.js'

export const createRefusalUtils = (): RefusalUtils => {
  const paramOf = (error: ErrorObject, key: string): unknown => (error.params as Record<string, unknown> | undefined)?.[key]

  /** The property a `required` or `additionalProperties` error is about — it has a path of its own. */
  const propertyOf = (error: ErrorObject): string | undefined => {
    const property = error.keyword === 'required'
      ? paramOf(error, 'missingProperty')
      : error.keyword === 'additionalProperties' ? paramOf(error, 'additionalProperty') : undefined

    return typeof property === 'string' ? property : undefined
  }

  /** What tells two errors of one keyword at one path apart: the property, the allowed values. */
  const detailOf = (error: ErrorObject): string => {
    const property = propertyOf(error)
    if (property != null) return property
    if (error.keyword === 'enum') return JSON.stringify(paramOf(error, 'allowedValues') ?? null)
    if (error.keyword === 'const') return JSON.stringify(paramOf(error, 'allowedValue') ?? null)

    return ''
  }

  const unescape = (segment: string): string => segment.replace(/~1/g, '/').replace(/~0/g, '~')
  const escape = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1')

  const instanceSegments = (error: ErrorObject): string[] =>
    error.instancePath === '' ? [] : error.instancePath.slice(1).split('/').map(unescape)

  const segmentsOf = (error: ErrorObject): string[] => {
    const segments = instanceSegments(error)
    const property = propertyOf(error)

    return property != null ? [...segments, property] : segments
  }

  const pointerOf = (segments: readonly string[]): string => segments.map(segment => `/${escape(segment)}`).join('')

  const valueAt = (value: unknown, segments: readonly string[]): unknown => {
    let current = value
    for (const segment of segments) {
      if (current == null || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[segment]
    }

    return current
  }

  const describe = (error: ErrorObject): string => {
    const detail = detailOf(error)
    return `${error.instancePath === '' ? '/' : error.instancePath} ${error.keyword}${detail !== '' ? ` ${detail}` : ''}`
  }

  const rejectionOf = (errors: readonly ErrorObject[]): LlmSchemaRejection => {
    const shown = JSON.stringify(errors.slice(0, VALIDATION_SUMMARY_ERRORS))
    const more = errors.length > VALIDATION_SUMMARY_ERRORS ? ` +${errors.length - VALIDATION_SUMMARY_ERRORS} more` : ''
    const rejection = new LlmSchemaRejection(`${shown}${more}`, [...errors])
    rejection.cause = errors[0]

    return rejection
  }

  const signatureOf = (errors: readonly ErrorObject[]): string =>
    [...new Set(errors.map(error => `${error.instancePath}|${error.keyword}|${detailOf(error)}`))].sort().join('\n')

  const pathsOf = (errors: readonly ErrorObject[]): string[] =>
    [...new Set(errors.map(error => pointerOf(segmentsOf(error))))]

  /** What the rule asks for, in words a model can act on. */
  const ruleOf = (error: ErrorObject): string => {
    const property = propertyOf(error)
    switch (error.keyword) {
      case 'required':
        return `the required property "${property}" is missing`
      case 'additionalProperties':
        return `the property "${property}" is not allowed`
      case 'enum':
        return `must be one of ${JSON.stringify(paramOf(error, 'allowedValues') ?? [])}`
      case 'const':
        return `must be ${JSON.stringify(paramOf(error, 'allowedValue') ?? null)}`
      default:
        return `${error.keyword}: ${error.message ?? 'is not valid'}`
    }
  }

  const fragmentOf = (value: unknown): string | undefined => {
    if (value === undefined) return undefined
    const json = JSON.stringify(value) ?? String(value)

    return json.length > MAX_FRAGMENT_CHARS ? `${json.slice(0, MAX_FRAGMENT_CHARS)}…` : json
  }

  const correctionOf = (errors: readonly ErrorObject[], value: unknown): string => {
    const lines = [CORRECTION_HEADER]
    const quoted = new Set<string>()
    errors.slice(0, MAX_CORRECTION_ERRORS).forEach((error, index) => {
      lines.push(`${index + 1}. ${error.instancePath === '' ? ROOT_PATH_LABEL : error.instancePath}: ${ruleOf(error)}`)
      // The object holding a missing property, the value a rule refused — once per path.
      if (!quoted.has(error.instancePath)) {
        quoted.add(error.instancePath)
        const fragment = fragmentOf(valueAt(value, instanceSegments(error)))
        if (fragment != null) lines.push(`   ${CORRECTION_VALUE_LABEL} ${fragment}`)
      }
    })
    if (errors.length > MAX_CORRECTION_ERRORS) {
      lines.push(`… and ${errors.length - MAX_CORRECTION_ERRORS} more.`)
    }
    lines.push(CORRECTION_INSTRUCTION)

    return lines.join('\n')
  }

  const reasonOf = (error: unknown): string => {
    if (error instanceof LlmSchemaRejection) {
      const first = error.details[0]
      return first != null ? `${VALIDATION_FAILED}:${describe(first)}` : VALIDATION_FAILED
    }
    if (error instanceof LlmOutputRejection) {
      const at = error.message.indexOf(`${FILTER_REJECTED}:`)
      return at >= 0 ? error.message.slice(at) : FILTER_REJECTED
    }
    // A filter that answered null: the model's own error quotes the refused output — never repeated.
    if (error instanceof LlmModelError && error.message.includes(`${FILTER_REJECTED}:`)) {
      return FILTER_REJECTED
    }

    return `${FILTER_REJECTED}:${error instanceof Error ? error.name : typeof error}`
  }

  return { rejectionOf, signatureOf, pathsOf, segmentsOf, pointerOf, valueAt, correctionOf, reasonOf }
}

export const refusalUtils = createRefusalUtils()
