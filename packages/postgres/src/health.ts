import type { BasicConfig, BasicContext } from '@owlmeans/context'

import { DEFAULT_ALIAS } from './consts.js'
import type { PostgresService } from './types.js'

export interface DbHealth {
  ok: boolean
  /** One line fit for a boot log — states what was checked, not only whether it passed. */
  summary: string
  error?: string
}

const lastHealth: Map<string, DbHealth> = new Map()

const keyOf = (alias: string, configAlias?: string): string => `${alias}:${configAlias ?? ''}`

/**
 * The outcome of the last {@link checkDbHealth} for the same pair of aliases.
 *
 * A request time handler wants the verdict of the boot check without paying for it again: the
 * structure was reconciled once, at init, and re-asserting it per request buys nothing.
 */
export const getLastDbHealth = (
  alias: string = DEFAULT_ALIAS, configAlias?: string
): DbHealth | undefined => lastHealth.get(keyOf(alias, configAlias))

/**
 * Surface the Postgres fields (code/severity/detail/hint) an error carries — a bare `.message`
 * hides the real FATAL/permission reason, and the cause chain is where the driver's error ends up
 * once a resource wraps it.
 */
export const formatDbError = (error: unknown): string => {
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current = error as (Record<string, any> | null | undefined)
  while (current != null && !seen.has(current)) {
    seen.add(current)
    const meta: string[] = []
    if (current.severity != null) meta.push(`severity=${current.severity}`)
    if (current.code != null) meta.push(`code=${current.code}`)
    if (current.detail != null) meta.push(`detail=${current.detail}`)
    if (current.hint != null) meta.push(`hint=${current.hint}`)
    const message = current.message ?? String(current)
    parts.push(meta.length > 0 ? `${message} (${meta.join(', ')})` : message)
    current = current.cause
  }

  const joined = parts.join('; caused by: ')

  return joined !== '' ? joined : String(error)
}

/**
 * Liveness only, through the context's own pool — no private client, no connection string, no
 * migration journal. The service is looked up by alias exactly as any other consumer looks it up,
 * so a health probe cannot end up connected differently from the app it reports on.
 *
 * The context arrives as an argument rather than as a module import: a handler is given the
 * context that actually served the request (possibly an entity scoped derivative), and taking it
 * as a parameter keeps this module out of the boot import cycle.
 */
export const pingDb = async (
  context: BasicContext<BasicConfig>, alias: string = DEFAULT_ALIAS, configAlias?: string
): Promise<DbHealth> => {
  try {
    const pool = await context.service<PostgresService>(alias).client(configAlias)
    await pool.query('SELECT 1')

    return { ok: true, summary: 'DB reachable' }
  } catch (error) {
    return { ok: false, summary: 'DB unreachable', error: formatDbError(error) }
  }
}

/**
 * The boot gate check: wait for the service to be ready, then assert the connection still works.
 *
 * Structure is reconciled by the resources during the context's `init()`; if that succeeded the
 * tables are correct by construction, and if it failed the process never got here. There is
 * nothing left to assert beyond "the connection works", which is why this is a `SELECT 1` and not
 * a schema walk. The result is cached for {@link getLastDbHealth}.
 */
export const checkDbHealth = async (
  context: BasicContext<BasicConfig>, alias: string = DEFAULT_ALIAS, configAlias?: string
): Promise<DbHealth> => {
  let result: DbHealth
  try {
    const service = context.service<PostgresService>(alias)
    await service.ready()
    const pool = await service.client(configAlias)
    await pool.query('SELECT 1')
    result = { ok: true, summary: 'DB OK — connected; structure reconciled at init' }
  } catch (error) {
    result = { ok: false, summary: 'DB check failed', error: formatDbError(error) }
  }

  lastHealth.set(keyOf(alias, configAlias), result)

  return result
}
