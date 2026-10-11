import { I18nTier } from '../consts.js'
import type { I18nLoaderStorage, I18nStorage } from '../types.js'

export const tierCost = {
  [I18nTier.Library]: 0,
  [I18nTier.App]: 1,
}

export const _OwlMeansI18nStorage: I18nStorage = {
  data: {}
}

/**
 * Lazy language loaders, keyed by language. Independent of `_OwlMeansI18nStorage`: a loader only
 * REGISTERS resources (through `addI18nLib` / `addI18nApp`); draining them stays `initI18nResource`'s job.
 */
export const _OwlMeansI18nLoaders: I18nLoaderStorage = {
  data: {}
}
