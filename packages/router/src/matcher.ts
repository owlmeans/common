import type { RouteObject, RouteParams, PatternSegment, RouteBranch, RouteMatch } from './types.js'
import { EMPTY_WEIGHT, INDEX_WEIGHT, PARAM, PARAM_WEIGHT, SEP, SPLAT, STATIC_WEIGHT } from './consts.local.js'
import type { RouteMatcherHelper } from './matcher/types.js'

export const createRouteMatcherHelper = (): RouteMatcherHelper => {
  const splitPath = (path?: string): string[] =>
    (path ?? '').split(SEP).filter(part => part.length > 0)

  const segmentsOf = (path?: string): PatternSegment[] =>
    splitPath(path).map(part => {
      if (part === SPLAT) return { kind: 'splat', value: SPLAT }
      if (part.startsWith(PARAM)) return { kind: 'param', value: part.slice(PARAM.length) }
      return { kind: 'static', value: part }
    })

  const flattenRoutes = (
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

  const rankRouteBranches = (branches: RouteBranch[]): RouteBranch[] =>
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

  const matchRoutes = (branches: RouteBranch[], pathname: string): RouteMatch[] | null => {
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

  return { splitPath, segmentsOf, flattenRoutes, rankRouteBranches, matchRoutes }
}

export const routeMatcherHelper = createRouteMatcherHelper()
