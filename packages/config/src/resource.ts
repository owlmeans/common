import type { ConfigRecord, BasicContext as Context } from '@owlmeans/context'
import { CONFIG_RECORD, appendContextual, assertContext } from '@owlmeans/context'
import type { CommonConfig, ConfigResource, ConfigResourceAppend } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'
import type { Criteria, FirstOptions, ListOptions } from '@owlmeans/resource'
import {
  applyQuery, filterRecords, firstMatch, UnknownRecordError, UnsupportedArgumentError,
  UnsupportedMethodError
} from '@owlmeans/resource'

/**
 * The records an application was configured with, read as a resource. The store is the array under
 * `cfg[key]`, so every read is a query over what is already in memory — and every write is refused,
 * because configuration is what the process was started with, not something it edits at runtime.
 */
export const createConfigResource = (alias: string = DEFAULT_ALIAS, key: string = CONFIG_RECORD) => {
  const location = `config-resource:${alias}`

  const _assertContext = (ctx: Context<CommonConfig> | undefined) => assertContext<CommonConfig, Context<CommonConfig>>(ctx, location)

  const getStore = (context: Context<CommonConfig>) => {
    if (context.cfg == null || !(key in context.cfg)) {
      throw new SyntaxError(`Config ${key} not found in context config`)
    }
    type Key = keyof typeof context.cfg
    if (!Array.isArray(context.cfg[key as Key])) {
      throw new SyntaxError(`Config records should be preinitilized with array on ${key}`)
    }
    return context.cfg[key as Key] as ConfigRecord[]
  }

  const records = (): ConfigRecord[] => getStore(_assertContext(resource.ctx))

  /** An id matches the record's own `id`; criteria go through the shared in-memory engine. */
  const first = (
    idOrWhere: string | Criteria<ConfigRecord>, opts?: FirstOptions<ConfigRecord>
  ): ConfigRecord | null => typeof idOrWhere === 'string'
    ? records().find(record => record.id === idOrWhere) ?? null
    : firstMatch(records(), idOrWhere, opts)

  const resource: ConfigResource = appendContextual<ConfigResource>(alias, {
    get: async (
      idOrWhere: string | Criteria<ConfigRecord>, opts?: FirstOptions<ConfigRecord>
    ): Promise<ConfigRecord> => {
      const record = first(idOrWhere, opts)
      if (record == null) {
        throw new UnknownRecordError(typeof idOrWhere === 'string' ? idOrWhere : 'criteria')
      }

      return record
    },

    load: async (
      idOrWhere: string | Criteria<ConfigRecord>, opts?: FirstOptions<ConfigRecord>
    ): Promise<ConfigRecord | null> => first(idOrWhere, opts),

    /** Unpaged unless a size is asked for — the whole config is already in memory. */
    list: async (where?: Criteria<ConfigRecord>, opts?: ListOptions<ConfigRecord>) => {
      if (opts?.page != null && opts.size == null) {
        throw new UnsupportedArgumentError('page-without-size')
      }

      return applyQuery(records(), where, opts)
    },

    count: async (where?: Criteria<ConfigRecord>) => filterRecords(records(), where).length,

    save: () => { throw new UnsupportedMethodError('config:save') },

    create: () => { throw new UnsupportedMethodError('config:create') },

    update: () => { throw new UnsupportedMethodError('config:update') },

    delete: () => { throw new UnsupportedMethodError('config:delete') },

    take: () => { throw new UnsupportedMethodError('config:take') },

    purge: () => { throw new UnsupportedMethodError('config:purge') }
  })

  return resource
}

export const appendConfigResource = <C extends CommonConfig, T extends Context<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS, key: string = CONFIG_RECORD
): T & ConfigResourceAppend => {
  const resource = createConfigResource(alias, key)

  const _ctx = ctx as T & ConfigResourceAppend

  _ctx.registerResource(resource)
  if (_ctx.getConfigResource == null) {
    _ctx.getConfigResource = alias => ctx.resource(alias ?? resource.alias)
  }

  return _ctx
}
