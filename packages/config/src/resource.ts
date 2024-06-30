import type { ConfigRecord, Context, UpdContextType } from '@owlmeans/context'
import { CONFIG_RECORD, appendContextual } from '@owlmeans/context'
import type { ConfigResource, ConfigResourceAppend } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'
import type { GetterOptions, ListOptions, ListResult, LivecycleOptions } from '@owlmeans/resource'
import { UnknownRecordError, UnsupportedArgumentError, UnsupportedMethodError } from '@owlmeans/resource'
import { ListCriteriaParams } from '@owlmeans/resource/build/utils/types.js'
import { basicAssertContext } from './utils/context.js'

type Getter = string | GetterOptions

export const createConfigResource = (alias: string = DEFAULT_ALIAS, key: string = CONFIG_RECORD) => {
  const getStore = (context: Context) => {
    if (context.cfg == null || !(key in context.cfg)) {
      throw new SyntaxError(`Config ${key} not found in context config`)
    }
    type Key = keyof typeof context.cfg
    if (!Array.isArray(context.cfg[key as Key])) {
      throw new SyntaxError(`Config records should be preinitilized with array on ${key}`)
    }
    return context.cfg[key as Key] as ConfigRecord[]
  }

  const assertContext = (ctx: Context | undefined): Context => basicAssertContext(ctx, `config:${alias}`)

  const resource: ConfigResource = appendContextual<ConfigResource>(alias, {
    get: async <T extends ConfigRecord>(id: string, field?: Getter, opts?: LivecycleOptions) => {
      const record = await resource.load<T>(id, field, opts)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    load: async <T extends ConfigRecord>(id: string, field?: Getter, opts?: LivecycleOptions) => {
      if (field != null) {
        throw new UnsupportedArgumentError('config:get:filed')
      }
      if (opts != null) {
        throw new UnsupportedArgumentError('config:get:opts')
      }
      const context = assertContext(resource.ctx)
      const store = getStore(context)
      const record = store.find(record => record.id === id) as T | undefined

      if (record == null) {
        return null
      }

      return record
    },

    list: async <T extends ConfigRecord>(criteria?: ListCriteriaParams, opts?: ListOptions) => {
      if (criteria != null) {
        throw new UnsupportedArgumentError('config:list:criteria')
      }
      if (opts != null) {
        throw new UnsupportedArgumentError('config:list:opts')
      }
      const context = assertContext(resource.ctx)

      const result: ListResult<T> = {
        items: getStore(context) as T[]
      }

      return result
    },

    save: () => { throw new UnsupportedMethodError('config:save') },

    create: () => { throw new UnsupportedMethodError('config:create') },

    update: () => { throw new UnsupportedMethodError('config:create') },

    delete: () => { throw new UnsupportedMethodError('config:create') },

    pick: () => { throw new UnsupportedMethodError('config:create') }
  })

  return resource
}


export const appendConfigResource = <C extends Context>(
  ctx: C, alias: string = DEFAULT_ALIAS, key: string = CONFIG_RECORD
): UpdContextType<C, ConfigResourceAppend> => {
  const resource = createConfigResource(alias, key)

  const _ctx = ctx as UpdContextType<C, ConfigResourceAppend>

  _ctx.registerResource(resource)
  _ctx.getConfigResource = () => ctx.resource(resource.alias)

  return _ctx
}
