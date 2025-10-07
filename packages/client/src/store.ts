import { useEffect, useId, useMemo, useState } from 'react'
import type { StateModel, UseStoreHelper, UseStoreHelperOptions, UseStoreListHelper } from '@owlmeans/state'
import { useContext } from './context.js'
import type { ResourceRecord } from '@owlmeans/resource'

export const useStoreModel: UseStoreHelper = (id, opts) => {
  const list = useStoreList(id, opts)

  if (list.length < 1) {
    throw new SyntaxError('Store always return model and create it if not exists')
  }

  return list[0]
}

export const useStoreList: UseStoreListHelper = (ids, opts) => {
  if (typeof ids === 'object' && !Array.isArray(ids)) {
    opts = ids
  }
  const params: UseStoreHelperOptions<ResourceRecord> = typeof opts === 'object' ? opts : {}
  if (typeof ids === 'string' || Array.isArray(ids)) {
    params.id = ids
  }
  if (typeof opts === 'string') {
    params.resource = opts
  } else if (typeof opts === 'boolean') {
    params.listen = opts
  }
  params.listen = params.listen ?? true

  const context = useContext()
  const resource = useMemo(() => context.getStateResource(params.resource), [params.resource])

  const deps = [
    Array.isArray(params.id) ? params.id.join(',') : params.id,
    params.query == null,
    JSON.stringify(params.default),
    params.listen
  ]

  const id = useId()
  const [models, setModels] = useState<StateModel<ResourceRecord>[]>([])

  const unsubscribe = useMemo(() => {
    const [unsubscribe, _initialModels] = resource.subscribe({
      _systemId: id,
      id: params.id,
      listener: models => {
        params.listen && setModels(models)
      },
      default: params.default,
      query: params.query,
    })
    
    setModels(_initialModels)

    return unsubscribe
  }, deps)

  useEffect(() => unsubscribe, deps)

  return models as StateModel<any>[]
}
