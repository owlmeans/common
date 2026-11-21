import { memoHelper } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { routerBaseHelper } from '@owlmeans/router'
import { useContext } from './context.js'
import type { ClientBaseHelper, ClientHref } from './base/types.js'

/**
 * The base is read from the context's configuration on every call, never captured: a context's
 * services can still be completed after the helper was first reached.
 */
export const makeClientBaseHelper = (ctx: BasicContext<any>): ClientBaseHelper => {
  const base = (): string => routerBaseHelper.baseOf(ctx)

  const href = (path: string): string => routerBaseHelper.join(base(), path)

  const strip = (pathname: string): string => routerBaseHelper.strip(pathname, base())

  return { base, href, strip }
}

export const clientBaseOf = memoHelper.oncePer(makeClientBaseHelper)

/**
 * For a component rendering an address by hand (`<a href={href(path)}>`): joins the application's
 * base onto a router-space path. Identity at the root.
 */
export const useHref = (): ClientHref => clientBaseOf(useContext()).href
