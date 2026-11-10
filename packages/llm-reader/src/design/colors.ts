import { formatHex, formatHex8, parse, wcagContrast } from 'culori'
import type { ColorHelper } from './types.local.js'

const TOKENS = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|\b[a-z]{3,20}\b/gi

/** Words culori would read as colors but a declaration uses as keywords. */
const NOT_COLORS = new Set(['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'transparent', 'none'])

export const createColorHelper = (): ColorHelper => {
  const normalize = (value: string): string | undefined => {
    const word = value.trim().toLowerCase()
    if (NOT_COLORS.has(word)) return undefined
    const color = parse(word)
    if (color == null) return undefined
    const alpha = color.alpha ?? 1
    if (alpha <= 0) return undefined
    return alpha < 1 ? formatHex8(color) : formatHex(color)
  }

  const extract = (value: string): string[] =>
    (value.match(TOKENS) ?? []).map(normalize).filter((color): color is string => color != null)

  const contrast = (a: string, b: string): number => wcagContrast(a, b)

  return { normalize, extract, contrast }
}

export const colorHelper = createColorHelper()
