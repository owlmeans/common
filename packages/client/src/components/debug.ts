import { assertContext, createLazyService } from '@owlmeans/context'
import { DEBUG_CONFIG_KEY, DEBUGGER_FLAG, DEF_DEBUG_ALIAS } from '../consts.js'
import type { DebugService, DebugServiceAppend } from './types.js'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext, DebugConfigRecord } from '../types.js'
import type { ClientDbService, ClientResource } from '@owlmeans/client-resource'
import { DEFAULT_DB_ALIAS } from '@owlmeans/client-resource'


export const createDebugService = (alias: string = DEF_DEBUG_ALIAS): DebugService => {
  const location = `debug-service:${alias}`

  const service: DebugService = createLazyService<DebugService>(alias, {
    items: [
      {
        alias: 'close',
        title: 'Close',
        action: async (modal) => modal.cancel()
      },
      {
        alias: 'reset',
        title: 'Reset app',
        action: async (modal, context) => {
          const service = context.service<ClientDbService>(DEFAULT_DB_ALIAS)
          await service.erase()
          context.rerender()
          modal.cancel()
          void modal.navigator?._navigate('/')

          return 'Client DB cleanedup!'
        }
      }
    ],

    addItem: item => service.items.push(item),

    erase: async states => {
      const context = assertContext(service.ctx, location) as ClientContext
      await Promise.all(states.map(async state => {
        console.log('try to erase state: ', state)
        await context.resource<ClientResource>(state).erase()
      }))
    },

    open: () => {
      const context = assertContext(service.ctx, location) as ClientContext
      void context.modal().request(service.Debug)
    },

    select: alias => {
      const item = service.items.find(item => item.alias === alias)
      if (item != null) {
        const context = assertContext(service.ctx, location) as ClientContext
        if (item.Com != null) {
          void context.modal().request<string>(item.Com)
            .then(result => result != null && alert(result))
        }
        if (item.action != null) {
          void item.action(context.modal(), context).then(result => result != null && alert(result))
        }
      }
    },
  }, service => async () => {
    service.initialized = true
    const context = assertContext(service.ctx, location) as ClientContext
    const record = await context.getConfigResource().load<DebugConfigRecord>(DEBUG_CONFIG_KEY)
    if (record?.states != null) {
      service.addItem({
        alias: 'reset-states',
        title: `Reset states`,
        action: async (modal, context) => {
          const record = await context.getConfigResource().load<DebugConfigRecord>(DEBUG_CONFIG_KEY)
          if (record?.states != null) {
            await service.erase(record.states)
            context.rerender()
            modal.cancel()

            return `States erased`
          }
          return 'No states to erase'
        }
      })
    }
  })

  return service
}

export const appendDebugService = <C extends ClientConfig, T extends ClientContext<C>>(
  ctx: T, alias: string = DEF_DEBUG_ALIAS
): T & DebugServiceAppend => {
  const _ctx = ctx as T & DebugServiceAppend

  const debuggable = _ctx.cfg.debug.all === true || _ctx.cfg.debug[DEBUGGER_FLAG] === true
  if (debuggable) {
    const service = createDebugService(alias)
    _ctx.registerService(service)
  }

  _ctx.debug = () => debuggable ? _ctx.service<DebugService>(alias) : undefined

  return _ctx
}
