import { appendContextual } from './helper.js'
import type { Contextual, InitializedService, LazyService, Service } from './types.js'

enum TypeToMethod {
  Lazy = 'lazyInit',
  Initialized = 'init'
}

export interface InitMethod<S extends Service> {
  (service: S): () => Promise<void>
}

interface CreateService<S extends Service> {
  (alias: string, service: Partial<S>, init?: InitMethod<S>): S
}

const _createService = <S extends Service>(type: TypeToMethod): CreateService<S> => (alias, service, init) => {
  if (service.registerContext == null) {
    appendContextual(alias, service as Contextual)
  }

  let initialize: (res: boolean) => void
  const ready = new Promise<boolean>(resolve => { initialize = resolve })

  service.alias = alias

  service.initialized = false

  service[type] = async () => {
    await init?.(service as S)()
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
