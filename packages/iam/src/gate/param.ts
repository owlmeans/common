import {
  RESOURCE_PARAM_SEPARATOR, RESOURCE_SOURCE_SEPARATOR, RESOURCE_PATH_SEPARATOR,
  GateParamSource, GateParamErrorCode, DEFAULT_GATE_PARAM_SOURCES
} from '../consts.js'
import type { GateResourceSelector, GateParamProblem, ParsedGateParam } from '../types.js'

const SOURCES = Object.values(GateParamSource) as string[]

/**
 * Read the `@…` half of a gate param.
 *
 * Two forms, and the difference between them is deliberate:
 *
 *   `@enquiryId`        — bare. A FLAT key, searched in `params` then `query`. It is never split on
 *                         a dot, because a query key legally contains one and splitting it would
 *                         change the meaning of selectors already deployed.
 *   `@body:order.id`    — qualified. An explicit source and a nested path.
 *
 * The rule worth remembering: the bare form is lenient and flat, the qualified form is strict and
 * nested.
 */
export const parseGateSelector = (selector: string): GateResourceSelector | GateParamProblem => {
  if (selector === '') {
    return { code: GateParamErrorCode.EmptySelector, detail: 'the selector after "@" is empty' }
  }

  const idx = selector.indexOf(RESOURCE_SOURCE_SEPARATOR)
  if (idx < 0) {
    return {
      selector,
      path: [selector],
      sources: DEFAULT_GATE_PARAM_SOURCES
    }
  }

  const source = selector.slice(0, idx)
  const rest = selector.slice(idx + 1)

  if (!SOURCES.includes(source)) {
    return {
      code: GateParamErrorCode.UnknownSource,
      detail: `"${source}" is not one of ${SOURCES.join(', ')}`
    }
  }

  if (rest === '') {
    return {
      code: GateParamErrorCode.EmptySelector,
      detail: `"${source}:" names no path`
    }
  }

  const path = rest.split(RESOURCE_PATH_SEPARATOR)
  if (path.some(segment => segment === '')) {
    return {
      code: GateParamErrorCode.EmptySegment,
      detail: `"${rest}" has an empty path segment`
    }
  }

  return {
    selector,
    source: source as GateParamSource,
    path,
    sources: [source as GateParamSource]
  }
}

/**
 * Split a gate param into the permission it checks and where the resource id comes from.
 *
 * Splits at the FIRST `@`. Everything before it is the permission name looked up in the subject's
 * grants; everything after says where to read the resource id at request time. The suffix is the
 * gate's syntax and nothing else's — a permission stored or granted under a name containing one is a
 * key nothing ever looks up.
 */
export const parseGateParam = (param: string): ParsedGateParam => {
  const idx = param.indexOf(RESOURCE_PARAM_SEPARATOR)
  if (idx < 0) {
    return { permission: param }
  }

  const permission = param.slice(0, idx)
  const selector = param.slice(idx + 1)
  const parsed = parseGateSelector(selector)

  if ('code' in parsed) {
    return { permission, resourceParam: selector, error: parsed }
  }

  return {
    permission,
    // Kept for readers written against the flat form. Only meaningful when the form IS flat.
    ...(parsed.source == null ? { resourceParam: selector } : {}),
    resource: parsed
  }
}

/** Compose a gate param. The inverse of `parseGateParam` for every selector it accepts. */
export const formatGateParam = (
  permission: string,
  selector?: string | { source?: GateParamSource, path: string[] }
): string => {
  if (selector == null) {
    return permission
  }

  if (typeof selector === 'string') {
    return selector === '' ? permission : `${permission}${RESOURCE_PARAM_SEPARATOR}${selector}`
  }

  if (selector.path.length < 1) {
    return permission
  }

  const path = selector.path.join(RESOURCE_PATH_SEPARATOR)
  const tail = selector.source == null
    ? path
    : `${selector.source}${RESOURCE_SOURCE_SEPARATOR}${path}`

  return `${permission}${RESOURCE_PARAM_SEPARATOR}${tail}`
}
