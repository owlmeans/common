import type { CommonEntrypoint } from '@owlmeans/entrypoint'

/**
 * The entrypoint declarations both sides share: the api elevates them with handlers, the web
 * elevates them with screens or just calls them. Routes resolve under the api service `base`
 * (`/api`), so an `entrypoint(route(alias, '/items', ...))` added here answers on `/api/items`.
 */
export const sharedEntrypoints: CommonEntrypoint[] = []
