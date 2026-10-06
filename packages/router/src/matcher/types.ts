import type { PatternSegment, RouteBranch, RouteMatch, RouteObject } from '../types.js'

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
export interface RouteMatcherHelper {
  /** The non-empty `/`-separated parts of a path. */
  splitPath: (path?: string) => string[]
  /** The pattern segments of a route path: static, `:param` or splat. */
  segmentsOf: (path?: string) => PatternSegment[]
  /**
   * Flatten a route tree into ranked-matchable branches. Every leaf and every node
   * carrying an index child produces a branch.
   */
  flattenRoutes: (routes: RouteObject[], parentChain?: RouteObject[], parentSegments?: PatternSegment[]) => RouteBranch[]
  /** Rank branches so the most specific match is tried first. Stable within equal score. */
  rankRouteBranches: (branches: RouteBranch[]) => RouteBranch[]
  /**
   * Match a pathname against ranked branches. Returns the winning branch as a
   * root→leaf chain of `RouteMatch` (params merged across the whole chain so every
   * depth sees the full leaf param set, matching react-router's `useParams`).
   */
  matchRoutes: (branches: RouteBranch[], pathname: string) => RouteMatch[] | null
}
