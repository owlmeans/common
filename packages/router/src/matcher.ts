import type { RouteObject, RouteParams } from './types.js'

/**
 * Pure, DOM-free route matcher. Supports exactly the route-description subset used
 * across the OwlMeans projects: static segments, `:param` dynamic segments, nested
 * (parent/child) routes and index routes. Splat (`*`) and optional (`:x?`) segments
 * are intentionally not implemented yet — a seam is reserved so they can be added
 * without changing the public shape.
 *
 * Segment weights mirror react-router's ranking intuition (static beats dynamic,
 * more specific / deeper beats shallower).
 */

const SEP = '/'
const PARAM = ':'
const SPLAT = '*'

const STATIC_WEIGHT = 10
const PARAM_WEIGHT = 4
const INDEX_WEIGHT = 2
const EMPTY_WEIGHT = 1

type SegmentKind = 'static' | 'param' | 'splat'

export interface PatternSegment {
  kind: SegmentKind
  /** literal value for static, param name for param */
  value: string
}

export interface RouteBranch {
  /** root → node chain; drives outlet depth in the renderer */
  chain: RouteObject[]
  segments: PatternSegment[]
  /** true when the terminal node is an index route */
  index: boolean
  score: number
}

export interface RouteMatch {
  route: RouteObject
  params: RouteParams
  pathname: string
}

export const splitPath = (path?: string): string[] =>
  (path ?? '').split(SEP).filter(part => part.length > 0)

export const segmentsOf = (path?: string): PatternSegment[] =>
  splitPath(path).map(part => {
    if (part === SPLAT) return { kind: 'splat', value: SPLAT }
    if (part.startsWith(PARAM)) return { kind: 'param', value: part.slice(PARAM.length) }
    return { kind: 'static', value: part }
  })

/**
 * Flatten a route tree into ranked-matchable branches. Every leaf and every node
 * carrying an index child produces a branch.
 */
export const flattenRoutes = (
  routes: RouteObject[],
  parentChain: RouteObject[] = [],
  parentSegments: PatternSegment[] = []
): RouteBranch[] => {
  const branches: RouteBranch[] = []

  for (const route of routes) {
    const chain = [...parentChain, route]

    if (route.index === true) {
      // An index route contributes an empty terminal at the parent's path.
      branches.push({ chain, segments: parentSegments, index: true, score: 0 })
      continue
    }

    const segments = [...parentSegments, ...segmentsOf(route.path)]
    const children = route.children ?? []

    if (children.length === 0) {
      branches.push({ chain, segments, index: false, score: 0 })
    } else {
      branches.push(...flattenRoutes(children, chain, segments))
    }
  }

  return branches
}

const scoreBranch = (branch: RouteBranch): number => {
  let score = branch.segments.reduce((acc, seg) => {
    if (seg.kind === 'static') return acc + STATIC_WEIGHT
    if (seg.kind === 'param') return acc + PARAM_WEIGHT
    return acc + EMPTY_WEIGHT
  }, 0)
  if (branch.segments.length === 0) score += EMPTY_WEIGHT
  if (branch.index) score += INDEX_WEIGHT
  return score
}

/** Rank branches so the most specific match is tried first. Stable within equal score. */
export const rankRouteBranches = (branches: RouteBranch[]): RouteBranch[] =>
  branches
    .map(branch => ({ ...branch, score: scoreBranch(branch) }))
    .map((branch, index) => ({ branch, index }))
    .sort((a, b) => (b.branch.score - a.branch.score) || (a.index - b.index))
    .map(({ branch }) => branch)

const matchBranch = (branch: RouteBranch, parts: string[]): RouteParams | null => {
  if (branch.segments.some(seg => seg.kind === 'splat')) {
    throw new Error('router matcher: splat (*) segments are not implemented yet')
  }
  // Exact-length match (no splats/optionals in the supported subset).
  if (branch.segments.length !== parts.length) return null

  const params: RouteParams = {}
  for (let i = 0; i < branch.segments.length; i++) {
    const seg = branch.segments[i]
    const part = parts[i]
    if (seg.kind === 'static') {
      if (seg.value.toLowerCase() !== part.toLowerCase()) return null
    } else {
      params[seg.value] = decodeURIComponent(part)
    }
  }
  return params
}

/**
 * Match a pathname against ranked branches. Returns the winning branch as a
 * root→leaf chain of `RouteMatch` (params merged across the whole chain so every
 * depth sees the full leaf param set, matching react-router's `useParams`).
 */
export const matchRoutes = (branches: RouteBranch[], pathname: string): RouteMatch[] | null => {
  const parts = splitPath(pathname)
  const ranked = rankRouteBranches(branches)

  for (const branch of ranked) {
    const params = matchBranch(branch, parts)
    if (params == null) continue

    return branch.chain.map(route => ({
      route,
      params,
      pathname: SEP + parts.join(SEP)
    }))
  }

  return null
}
