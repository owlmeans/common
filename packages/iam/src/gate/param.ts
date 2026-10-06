import {
  RESOURCE_PARAM_SEPARATOR, RESOURCE_SOURCE_SEPARATOR, RESOURCE_PATH_SEPARATOR,
  GateParamSource, GateParamErrorCode, DEFAULT_GATE_PARAM_SOURCES
} from '../consts.js'
import type { GateParamHelper, GateResourceSelector, GateParamProblem, ParsedGateParam } from './types.js'
import { SOURCES } from './consts.local.js'

export const createGateParamHelper = (): GateParamHelper => {
  const parseGateSelector = (selector: string): GateResourceSelector | GateParamProblem => {
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

  const parseGateParam = (param: string): ParsedGateParam => {
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

  const formatGateParam = (
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

  return { parseGateSelector, parseGateParam, formatGateParam }
}

export const gateParamHelper = createGateParamHelper()

/** @deprecated compat:factory-refactor — use `gateParamHelper.parseGateParam(…)` */
export const parseGateParam = (param: string): ParsedGateParam => gateParamHelper.parseGateParam(param)
