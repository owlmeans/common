import { createService } from '@owlmeans/context'
import { DEF_MODAL_ALIAS } from '../consts.js'
import type { ModalService, ModalServiceAppend, ModalStackLayer } from './types.js'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '../types.js'
import { useContext } from '../context.js'
import { useNavigate } from '../navigate.js'
import { useEffect } from 'react'

export const createModalService = (alias: string = DEF_MODAL_ALIAS): ModalService => {
  const close = () => {
    service.stack.pop()
    service.toggle.close()
    if (service.stack.length > 0) {
      setTimeout(() => service.toggle.open(), 500)
    }
  }

  const service: ModalService = createService<ModalService>(alias, {
    stack: [],

    link: toggle => service.toggle = toggle,

    layer: () => {
      if (service.stack.length === 0) {
        return undefined
      }

      return service.stack[service.stack.length - 1]
    },

    request: async Com => {
      const layer: ModalStackLayer = { Com }
      const defer = new Promise<any | null>((resolve, reject) => {
        layer.resolve = resolve
        layer.reject = reject
      })
      service.stack.push(layer)

      service.toggle.open()

      const result = await defer
      service.stack.pop()

      return result
    },

    error: error => {
      service.layer()?.reject?.(error)
      close()
    },

    response: result => {
      service.layer()?.resolve?.(result)
      close()
    },

    cancel: () => {
      service.layer()?.resolve?.(null)
      close()
    }
  }, service => async () => { service.initialized = true })

  return service
}

export const appendModalService = <C extends ClientConfig, T extends ClientContext<C>>(
  ctx: T, alias: string = DEF_MODAL_ALIAS
): T & ModalServiceAppend => {
  const service = createModalService(alias)

  const _ctx = ctx as T & ModalServiceAppend

  _ctx.registerService(service)

  _ctx.modal = () => _ctx.service(alias)

  return _ctx
}

export const useSetupModalNavigator = () => {
  const context = useContext()
  const navigator = useNavigate()
  useEffect(() => {
    const modal = context.modal()
    modal.navigator = navigator
  }, [])
}
