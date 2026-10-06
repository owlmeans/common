import { appendContextual } from './helper.js'
import type { Contextual, InitializedService, LazyService, Service, InitMethod } from './types.js'
import { TypeToMethod } from './consts.local.js'
import type { CreateService } from './types.local.js'

const _createService = <S extends Service>(type: TypeToMethod): CreateService<S> => (alias, service, init) => {
  if (service.registerContext == null) {
    appendContextual(alias, service as Contextual)
  }

  let initialize: (res: boolean) => void
  const ready = new Promise<boolean>(resolve => { initialize = resolve })

  service.alias = alias

  service.initialized = false

  init = init ?? (() => async () => {
    service.initialized = true
  })

  service[type] = async () => {
    await init(service as S)()
    initialize(true)
  }

  service.ready = () => ready

  return service as S
}

export const createService = <S extends InitializedService>(
  alias: string, service: Partial<S>, init?: InitMethod<S>
): S => _createService<S>(TypeToMethod.Initialized)(alias, service, init)

export const createLazyService = <S extends LazyService>(
  alias: string, service: Partial<S>, init?: InitMethod<S>
): S => _createService<S>(TypeToMethod.Lazy)(alias, service, init)
