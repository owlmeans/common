import type { RouterEnv } from './types.js'

/**
 * Default routing environment. In the browser `hasWindow` is true and `ssr` is
 * false, so the browser plugin (which matches always) is selected. An SSR host
 * will later provide a per-request env (with `ssr: true` and a `request`) so an
 * SSR plugin registered at a higher priority wins.
 *
 * This is the single source of environment truth for cascade selection — do not
 * bake `typeof window` checks into a plugin's `match`.
 */
export const defaultRouterEnv = (): RouterEnv => {
  const hasWindow = typeof window !== 'undefined'
  return { hasWindow, ssr: !hasWindow }
}
