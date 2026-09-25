import { DEFAULT_NAMESPACE } from '../consts.js'
import type { I18nLanguageLoaders, I18nLoaderStorage, I18nStorage } from '../types.js'

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

/**
 * Lazy language loaders, keyed by language. Independent of `_OwlMeansI18nStorage`: a loader only
 * REGISTERS resources (through `addI18nLib` / `addI18nApp`); draining them stays `initI18nResource`'s job.
 */
export const _OwlMeansI18nLoaders: I18nLoaderStorage = {
  data: {}
}

export const ensureLoaders = (lng: string): I18nLanguageLoaders => {
  if (_OwlMeansI18nLoaders.data[lng] == null) {
    _OwlMeansI18nLoaders.data[lng] = { requested: false, entries: [] }
  }

  return _OwlMeansI18nLoaders.data[lng]
}
