import type { RouteObject } from '@owlmeans/router'
import type { EntrypointTree, EntrypointTreeVisitor } from '../types.js'

/** The client routing tree of one context: its frontend entrypoints, nested, and the routes made from them. */
export interface ClientRouterHelper {
  /**
   * The frontend entrypoints this context serves — sticky ones, ones that name no service, and
   * ones of its own service — nested under their parents.
   */
  buildEntrypointTree: <R>() => EntrypointTree<R>
  /** Visits a tree depth-first, children before their parent, collecting what the visitor answers. */
  visitEntrypointTree: <T, R>(tree: EntrypointTree<T>, visitor: EntrypointTreeVisitor<T, R>) => Promise<R[]>
  /** Configures and initializes the context when it is not ready yet, then resolves its routes. */
  initializeRouter: () => Promise<RouteObject[]>
}
