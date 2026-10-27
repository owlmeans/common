/**
 * `@owlmeans/web-panel/picker/vocabulary` — the picker's data and its colour helper, with no React
 * and no icon set: the palette, the icon catalogue's names, categories and search words, and
 * `pickerColorHelper`. Safe to import from a server, a seed or a Node build script.
 */

import { PICKER_COLORS, PICKER_COLOR_KEYS, PICKER_FALLBACK_COLOR } from './vocabulary/consts.js'
import type { PickerColor, PickerColorHelper, ResolvedPickerColor } from './vocabulary/types.js'
import { colorUtils } from './utils/color.js'

export * from './vocabulary/consts.js'
export type * from './vocabulary/types.js'

export const createPickerColorHelper = (): PickerColorHelper => {
  // Derivation walks lightness in small steps; a page renders the same custom colour many times.
  const derived = new Map<string, ResolvedPickerColor>()

  const isHex = (value: unknown): value is string =>
    typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())

  const normalizeHex = (value: string): string | null => {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
    if (match == null) {
      return null
    }
    const digits = match[1].toLowerCase()

    return `#${digits.length === 3 ? [...digits].map(digit => digit + digit).join('') : digits}`
  }

  const humanize = (key: string): string => {
    const words = key.replace(/[-_]+/g, ' ').trim()

    return words === '' ? key : words[0].toUpperCase() + words.slice(1)
  }

  const fill = (color: PickerColor): ResolvedPickerColor => ({
    key: color.key,
    custom: false,
    label: color.label ?? humanize(color.key),
    swatch: color.swatch,
    ink: color.ink,
    soft: color.soft,
    inkDark: color.inkDark ?? color.ink,
    softDark: color.softDark ?? color.soft,
  })

  const custom = (hex: string): ResolvedPickerColor => {
    const known = derived.get(hex)
    if (known != null) {
      return known
    }
    const resolved: ResolvedPickerColor = { key: hex, custom: true, label: hex.toUpperCase(), swatch: hex, ...colorUtils.derive(hex) }
    derived.set(hex, resolved)

    return resolved
  }

  const resolve = (
    value: string | null | undefined, colors: readonly PickerColor[] = PICKER_COLORS
  ): ResolvedPickerColor | null => {
    if (typeof value !== 'string' || value.trim() === '') {
      return null
    }
    const key = value.trim()
    const known = colors.find(color => color.key === key) ?? colors.find(color => color.key === key.toLowerCase())
    if (known != null) {
      return fill(known)
    }
    const hex = normalizeHex(key)

    return hex != null && key.startsWith('#') ? custom(hex) : null
  }

  const paletteFallback = fill(PICKER_COLORS.find(color => color.key === PICKER_FALLBACK_COLOR) ?? PICKER_COLORS[0])

  const fallbackOf = (colors: readonly PickerColor[]): ResolvedPickerColor => {
    const fallback = colors.find(color => color.key === PICKER_FALLBACK_COLOR) ?? colors.at(0)

    return fallback != null ? fill(fallback) : paletteFallback
  }

  const styleOf = (
    value: string | null | undefined, colors: readonly PickerColor[] = PICKER_COLORS
  ): Record<string, string> => {
    const color = resolve(value, colors) ?? fallbackOf(colors)

    return {
      '--pick-swatch': color.swatch,
      '--pick-ink': color.ink,
      '--pick-soft': color.soft,
      '--pick-ink-dark': color.inkDark,
      '--pick-soft-dark': color.softDark,
    }
  }

  const hashKey = (seed: string, keys: readonly string[] = PICKER_COLOR_KEYS): string => {
    // FNV-1a: tiny, stable across runtimes, and spreads short ids well enough for a palette.
    let hash = 0x811c9dc5
    for (let index = 0; index < seed.length; index++) {
      hash ^= seed.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }

    return keys.length > 0 ? keys[hash % keys.length] : PICKER_FALLBACK_COLOR
  }

  return { isHex, normalizeHex, resolve, styleOf, hashKey }
}

export const pickerColorHelper = createPickerColorHelper()
