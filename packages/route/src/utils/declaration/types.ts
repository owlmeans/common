import type { RouteDeclaration } from '../../types.js'

/** Context-free edits and reads of one route declaration. */
export interface RouteDeclarationHelper {
  /** Fills the declaration's unset fields from `overrides`, limited to `filter` keys when given. */
  overrideParams: (route: RouteDeclaration, overrides?: Partial<RouteDeclaration>, filter?: string[]) => void
  /** `path` under the declaration's own `base`, when it has one. */
  prependBase: (route: RouteDeclaration, path: string) => string
}
