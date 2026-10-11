import type { i18n } from 'i18next'
import { useMemo } from 'react'
import type { ClientConfig } from '@owlmeans/client-context'
import { i18nInstanceHelper } from './instance.js'

/** The process's i18next instance, created on the first render that asks. */
export const useI18nInstance = (config: ClientConfig): i18n => {
  const instance = useMemo(() => i18nInstanceHelper.getI18nInstance(config), [])

  return instance
}
