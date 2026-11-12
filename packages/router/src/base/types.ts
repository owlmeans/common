import type { BasicContext } from '@owlmeans/context'

/**
 * The web application's own base — the path its host serves it under (`''` at the root,
 * `/admin` for an application mounted at `/admin`).
 *
 * Paths inside an application stay base-less ("router space"): route declarations, entrypoint
 * paths, `useLocation().pathname`. The base is ADDED where an address leaves the router — a
 * History push/replace, a rendered `href`, `window.open`/`location`, a `next=` parameter — and
 * STRIPPED where the browser's address comes back in (`window.location.pathname`).
 *
 * With a root base every member returns its input unchanged.
 */
export interface RouterBaseHelper {
  /**
   * `''`, `'/'`, blank or missing → `''`; `admin`, `/admin`, `/admin/` → `/admin`. The rule of
   * `makeUrl` (`@owlmeans/config`), so a base reads the same wherever it is composed.
   */
  normalize: (base?: string | null) => string
  /**
   * A browser pathname read back into router space: `/admin/users` → `/users`, `/admin` →
   * `/`. A pathname outside the base is returned unchanged.
   */
  strip: (pathname: string, base?: string | null) => string
  /**
   * A router-space path as the browser addresses it: `/users` → `/admin/users`. Left alone: an
   * absolute URL (`https:`, `mailto:`, any scheme), a protocol-relative `//host`, a fragment
   * (`#…`), a query (`?…`), a relative path and the empty string.
   */
  join: (base: string | null | undefined, path: string) => string
  /**
   * The base of the context's own frontend service, `cfg.services[cfg.service].base`, normalized;
   * `''` without a context, a service entry or a base.
   */
  baseOf: (ctx?: BasicContext<any> | null) => string
}
