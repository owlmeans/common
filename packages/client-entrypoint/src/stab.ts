import type { RefedEntrypointHandler } from './types.js'

/** The no-op handler of a URL-only frontend binding. */
export const stab: RefedEntrypointHandler<{}> = () => () => {
  return void 0 as any
}
