import type { Context, Contextual } from '@owlmeans/context'
import type { Route, RouteModel } from '../types.js'

export const getParentRoute = async (context: Context, route: Route): Promise<Route | null> => {
  if (route.parent != null) {
    const parent = context.module<Contextual & { route: RouteModel }>(route.parent)
    assertCycle(context, route, parent.route.route)
    if (parent.route == null) {
      throw new SyntaxError('Parent module doesn\'t provide a route')
    }
    await parent.route.resolve(context)

    return parent.route.route
  }

  return null
}

/**
 * @throws {SyntaxError}
 */
const assertCycle = (context: Context, route: Route, parent: Route) => {
  while (parent.parent != null) {
    if (parent.parent === route.alias) {
      throw new SyntaxError(`Route parentship cycle detected. Parent: ${parent.alias} has his child as ancestor ${route.alias}`)
    }
    parent = context.module<Contextual & { route: RouteModel }>(parent.parent).route.route
  }
}
