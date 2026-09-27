import { makeContext as makeBasicContext } from '@owlmeans/server-app'
import type { Config, Context } from './types.js'

/**
 * Where the app's resources are registered. `@owlmeans/static-resource` is already a dependency,
 * so `appendStaticResource<C, T>(context, ALIAS)` gives you an in-memory store with no database
 * behind it; a mongo/postgres resource takes its place once the data has to outlive the process.
 * Whatever you append here must also widen `Context` in `types.ts`, or the getter will not exist.
 */
export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T =>
  makeBasicContext<C, T>(cfg, true)
