import type { GateParamSource, GateParamErrorCode, GateResolutionFailure } from '../consts.js'

/**
 * The parts of a request a gate selector may read.
 *
 * Structural on purpose: `AbstractRequest` is assignable to it, so `@owlmeans/server-iam` passes its
 * request straight through, while tooling outside the server stack can resolve a selector against a
 * plain object without taking a dependency on `@owlmeans/entrypoint`.
 */
export interface GateRequestLike {
  params?: unknown
  query?: unknown
  body?: unknown
  headers?: unknown
  auth?: unknown
}

/** Where one gate param reads its resource id from. */
export interface GateResourceSelector {
  /** The selector text exactly as written, for diagnostics. */
  readonly selector: string
  /** Undefined for the bare form, which searches `sources` in order. */
  readonly source?: GateParamSource
  /** Length 1 and UNSPLIT for the bare form — a bare key may legally contain dots. */
  readonly path: string[]
  /** The explicit source, or `DEFAULT_GATE_PARAM_SOURCES`. */
  readonly sources: GateParamSource[]
}

export interface GateParamProblem {
  code: GateParamErrorCode
  detail: string
}

export interface ParsedGateParam {
  permission: string
  /**
   * @deprecated The bare-form flat key, kept so existing readers keep compiling. Read `resource`,
   * which carries the source and the path for both forms.
   */
  resourceParam?: string
  resource?: GateResourceSelector
  error?: GateParamProblem
}

export interface GateResourceResolution {
  id?: string
  from?: GateParamSource
  reason?: GateResolutionFailure
}

/** What an entrypoint declares, so a selector can be checked against it before it is ever deployed. */
export interface GateParamAudit {
  routePath?: string
  routeParams?: string[]
  filter?: {
    query?: object
    params?: object
    body?: object
    headers?: object
  }
}

export interface GateParamIssue {
  param: string
  code: GateParamErrorCode
  detail: string
}

/** The gate-param grammar: `<permission>@<selector>` read, written and taken apart. */
export interface GateParamHelper {
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
  parseGateSelector: (selector: string) => GateResourceSelector | GateParamProblem
  /**
   * Split a gate param into the permission it checks and where the resource id comes from.
   *
   * Splits at the FIRST `@`. Everything before it is the permission name looked up in the subject's
   * grants; everything after says where to read the resource id at request time. The suffix is the
   * gate's syntax and nothing else's — a permission stored or granted under a name containing one is a
   * key nothing ever looks up.
   */
  parseGateParam: (param: string) => ParsedGateParam
  /** Compose a gate param. The inverse of `parseGateParam` for every selector it accepts. */
  formatGateParam: (
    permission: string,
    selector?: string | { source?: GateParamSource, path: string[] }
  ) => string
}

/** Gate params checked against the entrypoint that declares them. */
export interface GateValidationHelper {
  /** The `:name` segments of a route template. */
  routeParamsOf: (path: string) => string[]
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
  validateGateParams: (params: string[], audit?: GateParamAudit) => GateParamIssue[]
}
