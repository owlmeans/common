import { PICKER_COLORS } from '../../picker/vocabulary/consts.js'
import type { PickerIconCategory, ResolvedPickerColor } from '../../picker/vocabulary/types.js'
import type { PickerTranslate } from './types.js'
import type { PickerMode, PickerText } from './types.local.js'

const english: PickerTranslate = (_key, fallback) => fallback

const humanize = (name: string): string => {
  const words = name.replace(/-/g, ' ')

  return words === '' ? name : words[0].toUpperCase() + words.slice(1)
}

/** Every string a picker shows, through one `translate` (English without one). Built once per render. */
export const makePickerText = (translate: PickerTranslate = english): PickerText => {
  const text = (key: string, fallback: string): string => translate(key, fallback)

  // Only the palette's own names translate; an application palette's labels are shown as given
  // (a status palette may well have a key called `red` labelled "Blocked").
  const color = (resolved: ResolvedPickerColor): string =>
    !resolved.custom && PICKER_COLORS.some(entry => entry.key === resolved.key && entry.label === resolved.label)
      ? translate(`colors.${resolved.key}`, resolved.label)
      : resolved.label

  const icon = (name: string): string => humanize(name)

  const category = (value: PickerIconCategory): string => translate(`categories.${value}`, humanize(value))

  // Filled after translation: a `{count}` placeholder is never one i18next interpolates or strips.
  const count = (value: number): string => translate('results', 'Icons found: {count}').replace('{count}', String(value))

  const empty = (query: string): string => translate('empty', 'No icons match “{query}”').replace('{query}', query)

  const summary = (
    iconName: string | null | undefined, resolved: ResolvedPickerColor | null, mode: PickerMode
  ): string | null => {
    const parts = [
      mode !== 'color' && iconName != null && iconName !== '' ? icon(iconName) : null,
      mode !== 'icon' && resolved != null ? color(resolved) : null,
    ].filter((part): part is string => part != null)

    return parts.length > 0 ? parts.join(' · ') : null
  }

  return { text, color, icon, category, count, empty, summary }
}
