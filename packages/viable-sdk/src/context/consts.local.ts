/**
 * The platform's websocket namespace, which the planning commit feed is declared under.
 *
 * A literal because it belongs to the platform: `makePlanningProtocols` takes it as a parameter for
 * exactly this reason, so that neither end has to import the other's constants.
 */
export const UPDATE_BASE = 'viable:manager-api:update:base'

/**
 * The base alias and path manager-api mounts the planning protocol tree under.
 *
 * Literals for the same reason as {@link UPDATE_BASE}: they belong to manager-api, and
 * `makePlanningProtocols` takes them as parameters so neither end imports the other's constants.
 * Every planning alias and path derives from these, so the two ends agree on a route only while
 * both build the tree from the same base, path and socket base.
 */
export const PLANNING_BASE_ALIAS = 'viable:manager-api:planning'

export const PLANNING_BASE_PATH = '/planning'
