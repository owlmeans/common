import { DISPATCHER_SURROGATE } from '@owlmeans/auth'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { LOGIN_INTENT_QUERY, LOGIN_METHOD_QUERY, LOGIN_NEXT_QUERY } from './consts.js'
import type { LoginContext } from './types.js'
import type { SurrogateTarget } from './surrogate/types.js'

/**
 * Where a surrogate window opens.
 *
 * Returns `null` when the application's entrypoint list predates the surrogate route — an app
 * built against an older `@owlmeans/auth-common` has no such entrypoint, and the caller then falls
 * back to opening the dispatcher directly, which is exactly what it used to do. That fallback is
 * the whole compatibility story for already-deployed applications, so it must never be removed in
 * favour of throwing.
 */
export const surrogatePath = (ctx: LoginContext, target: SurrogateTarget): string | null => {
  if (!ctx.hasEntrypoint(DISPATCHER_SURROGATE)) {
    return null
  }
  let path: string
  try {
    path = ctx.entrypoint<ClientEntrypoint>(DISPATCHER_SURROGATE).path()
  } catch {
    return null
  }

  const query = new URLSearchParams()
  query.set(LOGIN_INTENT_QUERY, target.intent)
  if (target.next != null && target.next !== '') {
    query.set(LOGIN_NEXT_QUERY, target.next)
  }
  if (target.method != null && target.method !== '') {
    query.set(LOGIN_METHOD_QUERY, target.method)
  }

  return `${path}?${query.toString()}`
}
