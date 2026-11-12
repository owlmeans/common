/**
 * The application's own base, bound to its context — `''` at the root, `/admin` for an
 * application its host serves under `/admin` (`cfg.services[cfg.service].base`).
 *
 * Paths inside the application stay base-less: routes, entrypoint paths, `useLocation()`. The base
 * is joined in where an address leaves the router — a rendered `href`, `window.open`,
 * `window.location`, a `next=` parameter — and stripped where the browser's address comes back in.
 * At the root every member is the identity. Reached as `clientBaseOf(ctx)`; a component uses
 * `useHref()`.
 */
export interface ClientBaseHelper {
  /** The normalized base: `''` or `/<mount>`. */
  base: () => string
  /**
   * A router-space path as the browser addresses it — `/dispatcher` → `/admin/dispatcher`. An
   * absolute URL, `//host`, `#…`, `?…`, a relative path and `''` are returned unchanged.
   */
  href: (path: string) => string
  /** A browser pathname read back into router space — `/admin/users` → `/users`. */
  strip: (pathname: string) => string
}

/** What `useHref()` returns: a router-space path → the address the browser uses. */
export interface ClientHref {
  (path: string): string
}
