import { DEFAULT_NAMESPACE } from '../consts.js'
import type { I18nStorage } from '../types.js'

export const _OwlMeansI18nStorage: I18nStorage = {
  data: {}
}

export const ensureStructure = (lng: string, resource: string, ns?: string) => {
  ns = ns ?? DEFAULT_NAMESPACE
  if (!_OwlMeansI18nStorage.data[ns]) {
    _OwlMeansI18nStorage.data[ns] = {}
  }
  if (!_OwlMeansI18nStorage.data[ns][resource]) {
    _OwlMeansI18nStorage.data[ns][resource] = {}
  }
  if (!_OwlMeansI18nStorage.data[ns][resource][lng]) {
    _OwlMeansI18nStorage.data[ns][resource][lng] = {
      resources: [],
      lngInitialized: []
    }
  }

  return _OwlMeansI18nStorage.data[ns][resource][lng]
}
