import { useCallback } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { EMAIL_AUTH_I18N } from '../consts.js'
import type { Translate } from '../types.js'

/**
 * This package's own translator (`lib : auth-email`), in the `(key, defaultValue)` shape every
 * component here takes as its `translate` prop. Needs the application's i18n provider.
 */
export const useEmailAuthTranslate = (): Translate => {
  const t = useI18nLib(EMAIL_AUTH_I18N)

  return useCallback((key: string, defaultValue: string) => t(key, { defaultValue }), [t])
}
