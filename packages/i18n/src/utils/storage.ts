import { DEFAULT_NAMESPACE } from '../consts.js'
import type { I18nLanguageLoaders, I18nLanguages } from '../types.js'
import { _OwlMeansI18nLoaders, _OwlMeansI18nStorage } from './consts.js'
import type { I18nStorageUtils } from './storage/types.js'

export const createI18nStorageUtils = (): I18nStorageUtils => {
  const ensureStructure = (lng: string, resource: string, ns?: string): I18nLanguages[string] => {
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

  const ensureLoaders = (lng: string): I18nLanguageLoaders => {
    if (_OwlMeansI18nLoaders.data[lng] == null) {
      _OwlMeansI18nLoaders.data[lng] = { requested: false, entries: [] }
    }

    return _OwlMeansI18nLoaders.data[lng]
  }

  return { ensureStructure, ensureLoaders }
}

export const i18nStorageUtils = createI18nStorageUtils()
