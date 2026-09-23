import { _OwlMeansI18nLoaders, _OwlMeansI18nStorage } from '@owlmeans/i18n/utils'

/** Reset the global i18n storage and the language loaders between tests. */
export const resetStorage = () => {
  _OwlMeansI18nStorage.data = {}
  _OwlMeansI18nLoaders.data = {}
}
