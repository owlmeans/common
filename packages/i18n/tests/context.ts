import { _OwlMeansI18nStorage } from '@owlmeans/i18n/utils'

/** Reset the global i18n storage between tests. */
export const resetStorage = () => {
  _OwlMeansI18nStorage.data = {}
}
