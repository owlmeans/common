import { normalizePath, SEP, PARAM } from '@owlmeans/route'
import { GateParamSource, GateParamErrorCode } from '../consts.js'
import type { GateParamAudit, GateParamIssue, GateResourceSelector } from '../types.js'
import { parseGateParam } from './param.js'

/** The `:name` segments of a route template. */
export const routeParamsOf = (path: string): string[] =>
  normalizePath(path).split(SEP)
    .filter(segment => segment.startsWith(PARAM))
    .map(segment => segment.slice(PARAM.length))

interface SchemaLike {
  properties?: Record<string, unknown>
  additionalProperties?: unknown
}

/**
 * Whether a key can survive validation to reach the gate.
 *
 * The server compiles entrypoint filters with AJV's `removeAdditional`, which strips an undeclared
 * key BEFORE the handler — and therefore before the gate — runs. So a selector naming a key the
 * filter does not declare denies every request, with a clean build and nothing logged.
 *
 * The `additionalProperties === false` qualifier is what makes this check usable rather than noise:
 * AJV only strips when a schema says so. An entrypoint that declares no filter for a source strips
 * nothing, and reporting those would fire on nearly every endpoint and be ignored within a week.
 */
const unreachable = (schema: object | undefined, key: string): boolean => {
  if (schema == null) {
    return false
  }

  const { properties, additionalProperties } = schema as SchemaLike
  if (additionalProperties !== false) {
    return false
  }

  return properties == null || !(key in properties)
}

const filterFor = (audit: GateParamAudit, source: GateParamSource): object | undefined => {
  switch (source) {
    case GateParamSource.Query: return audit.filter?.query
    case GateParamSource.Body: return audit.filter?.body
    case GateParamSource.Headers: return audit.filter?.headers
    case GateParamSource.Params: return audit.filter?.params
    case GateParamSource.Auth: return undefined
  }
}

const auditSelector = (
  audit: GateParamAudit, selector: GateResourceSelector
): Omit<GateParamIssue, 'param'> | null => {
  const key = selector.path[0]
  if (key == null) {
    return null
  }

  // The bare form searches route params first and the query second, so it is only provably wrong
  // when BOTH are impossible. A declared route param settles it; otherwise fall through to the
  // query check below, which only fires on an explicitly closed schema.
  const routeParams = audit.routeParams
    ?? (audit.routePath != null ? routeParamsOf(audit.routePath) : undefined)

  if (selector.source == null) {
    if (routeParams?.includes(key) === true) {
      return null
    }
    if (unreachable(audit.filter?.query, key) && unreachable(audit.filter?.params, key)) {
      return {
        code: GateParamErrorCode.UnknownRouteParam,
        detail: `"${key}" is not a route param of "${audit.routePath ?? '?'}"`
          + ' and is declared by neither the params nor the query filter'
      }
    }
    return null
  }

  if (selector.source === GateParamSource.Params) {
    if (routeParams != null && !routeParams.includes(key) && unreachable(audit.filter?.params, key)) {
      return {
        code: GateParamErrorCode.UnknownRouteParam,
        detail: `"${key}" is not a route param of "${audit.routePath ?? '?'}"`
      }
    }
    return null
  }

  if (unreachable(filterFor(audit, selector.source), key)) {
    return {
      code: GateParamErrorCode.UnreachableKey,
      detail: `the ${selector.source} filter declares no "${key}" and forbids additional properties,`
        + ' so it is removed by validation before the gate can read it'
    }
  }

  return null
}

/**
 * Check gate params against what their entrypoint declares.
 *
 * Reports only what is provable from the declaration itself. Anything that would need a guess is
 * left alone: a check that fires on correct code stops being read.
 *
 * Meant to run where a mistake can still be fixed — while code is being generated, or once per alias
 * as a diagnostic. It must never decide a request: with `some()` semantics across params, one
 * malformed sibling must not be able to refuse a legitimately passing one.
 */
export const validateGateParams = (params: string[], audit?: GateParamAudit): GateParamIssue[] => {
  const issues: GateParamIssue[] = []

  for (const param of params) {
    const parsed = parseGateParam(param)

    if (parsed.error != null) {
      issues.push({ param, code: parsed.error.code, detail: parsed.error.detail })
      continue
    }

    if (parsed.resource == null || audit == null) {
      continue
    }

    const issue = auditSelector(audit, parsed.resource)
    if (issue != null) {
      issues.push({ param, ...issue })
    }
  }

  return issues
}
