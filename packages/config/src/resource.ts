import type { ConfigRecord, BasicContext as Context } from '@owlmeans/context'
import { CONFIG_RECORD, appendContextual, assertContext } from '@owlmeans/context'
import type { CommonConfig, ConfigResource, ConfigResourceAppend } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'
import type { GetterOptions, ListOptions, ListResult, LifecycleOptions, ListCriteria } from '@owlmeans/resource'
import { UnknownRecordError, UnsupportedArgumentError, UnsupportedMethodError } from '@owlmeans/resource'

type Getter = string | GetterOptions

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

  const resource: ConfigResource = appendContextual<ConfigResource>(alias, {
    get: async <T extends ConfigRecord>(id: string, field?: Getter, opts?: LifecycleOptions) => {
      const record = await resource.load<T>(id, field, opts)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    load: async <T extends ConfigRecord>(id: string, field?: Getter, opts?: LifecycleOptions) => {
      field = field ?? 'id'
      if (opts != null) {
        throw new UnsupportedArgumentError('config:get:opts')
      }
      const context = _assertContext(resource.ctx)
      const store = getStore(context)
      const record = store.find(record => record[field as keyof typeof record] === id) as T | undefined

      if (record == null) {
        return null
      }

      return record
    },

    list: async <T extends ConfigRecord>(criteria?: ListOptions | ListCriteria, opts?: ListOptions) => {
      if (opts != null) {
        throw new UnsupportedArgumentError('config:list:opts')
      }
      const context = _assertContext(resource.ctx)

      const items = getStore(context) as T[]

      const result: ListResult<T> = {
        items: items.filter(item => {
          if (criteria == null) {
            return true
          }
          
          return Object.entries(criteria).every(([key, value]) => item[key as keyof T] === value)
        })
      }

      return result
    },

    save: () => { throw new UnsupportedMethodError('config:save') },

    create: () => { throw new UnsupportedMethodError('config:create') },

    update: () => { throw new UnsupportedMethodError('config:update') },

    delete: () => { throw new UnsupportedMethodError('config:delete') },

    pick: () => { throw new UnsupportedMethodError('config:pick') }
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
