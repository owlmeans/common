import { useCallback } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import type { PickerTranslate } from './types.js'

/**
 * A `translate` reading the picker's own library bundle (`lib:picker`, eight languages) in the
 * current language — what an application rendered by `PanelApp` / `render()` passes to every picker
 * part. It needs that i18n instance: called anywhere without one it throws inside render, which is
 * exactly why no picker part calls it by itself. Missing keys fall back to the English text.
 */
export const usePickerTranslate = (): PickerTranslate => {
  const t = useI18nLib('picker')

  return useCallback<PickerTranslate>((key, fallback) => t(key, { defaultValue: fallback }), [t])
}
