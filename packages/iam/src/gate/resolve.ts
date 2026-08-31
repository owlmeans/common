import { GateParamSource, GateResolutionFailure } from '../consts.js'
import type { GateRequestLike, GateResourceSelector, GateResourceResolution } from '../types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object'

/**
 * A resource id is a scalar. Anything else is refused rather than coerced.
 *
 * Stringifying an object would produce `"[object Object]"`, which then either matches nothing or —
 * far worse — matches another record that stringified the same way.
 */
const scalar = (value: unknown): string | null => {
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
    case 'boolean':
    case 'bigint':
      return `${value}`
    default:
      return null
  }
}

const sourceOf = (req: GateRequestLike, source: GateParamSource): unknown => {
  switch (source) {
    case GateParamSource.Params: return req.params
    case GateParamSource.Query: return req.query
    case GateParamSource.Body: return req.body
    case GateParamSource.Headers: return req.headers
    case GateParamSource.Auth: return req.auth
  }
}

/**
 * Walk one source for the selector's path.
 *
 * Headers get two adjustments they need and nothing else does: the first segment is lowercased,
 * because HTTP header names are case-insensitive and every server normalises them differently; and a
 * single-element array unwraps, because a repeated header arrives as an array and silently picking
 * one of several values would be an authorization decision made by accident.
 */
const walk = (
  container: unknown, path: string[], source: GateParamSource
): { value?: unknown, reason?: GateResolutionFailure } => {
  if (!isRecord(container)) {
    return { reason: GateResolutionFailure.SourceMissing }
  }

  let cursor: unknown = container
  for (const [index, rawSegment] of path.entries()) {
    if (!isRecord(cursor)) {
      return { reason: GateResolutionFailure.NotProvided }
    }

    const segment = source === GateParamSource.Headers && index === 0
      ? rawSegment.toLowerCase()
      : rawSegment

    cursor = cursor[segment]
  }

  if (source === GateParamSource.Headers && Array.isArray(cursor)) {
    if (cursor.length !== 1) {
      return { reason: GateResolutionFailure.NotScalar }
    }
    cursor = cursor[0]
  }

  if (cursor == null) {
    return { reason: GateResolutionFailure.NotProvided }
  }

  return { value: cursor }
}

/**
 * Resolve the resource id a selector points at.
 *
 * Sources are tried in the selector's own order — for the bare form, route params before the query —
 * and the first that yields a value wins. When none does, the reason travels back so the caller can
 * tell a MISCONFIGURED gate (the request never carried that key) from a legitimately DENIED one.
 */
export const resolveGateResource = (
  req: GateRequestLike, selector: GateResourceSelector
): GateResourceResolution => {
  let reason: GateResolutionFailure = GateResolutionFailure.SourceMissing

  for (const source of selector.sources) {
    const result = walk(sourceOf(req, source), selector.path, source)

    if (result.reason != null) {
      // A hard refusal is more informative than "keep looking" — report it rather than letting a
      // later, emptier source overwrite it with a vaguer reason.
      if (result.reason === GateResolutionFailure.NotScalar) {
        return { reason: result.reason, from: source }
      }
      if (reason === GateResolutionFailure.SourceMissing) {
        reason = result.reason
      }
      continue
    }

    const value = scalar(result.value)
    if (value == null) {
      return { reason: GateResolutionFailure.NotScalar, from: source }
    }

    return { id: value, from: source }
  }

  return { reason }
}
