import { CSS_TOKENS } from './consts.local.js'
import type { CssReference, CssRefs } from './types.local.js'

/** CSS escapes undone — `\31 ` → `1`, `\"` → `"`. */
const unescape = (text: string): string =>
  text.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\n])/g, (_, hex: string | undefined, char: string | undefined) =>
    hex != null ? String.fromCodePoint(parseInt(hex, 16)) : char!)

export const createCssRefs = (): CssRefs => {
  /** The reference a match makes, or `undefined` for a comment. */
  const referenceOf = (groups: Array<string | undefined>): CssReference | undefined => {
    const [i1, i2, i3, i4, i5, u1, u2, u3] = groups
    const imported = i1 ?? i2 ?? i3 ?? i4 ?? i5
    if (imported != null) return { href: unescape(imported), kind: 'import' }
    const url = u1 ?? u2 ?? u3
    return url != null ? { href: unescape(url), kind: 'url' } : undefined
  }

  const references: CssRefs['references'] = css => {
    const found: CssReference[] = []
    for (const match of css.matchAll(CSS_TOKENS)) {
      const reference = referenceOf(match.slice(1))
      if (reference != null && reference.href.trim() !== '') found.push(reference)
    }
    return found
  }

  const rewrite: CssRefs['rewrite'] = (css, replace) => css.replace(CSS_TOKENS, (match: string, ...rest: unknown[]) => {
    const reference = referenceOf(rest.slice(0, 8) as Array<string | undefined>)
    if (reference == null) return match
    const next = replace(reference)
    if (next == null) return match
    const quoted = `"${next.replace(/["\\\n]/g, char => char === '\n' ? '\\a ' : `\\${char}`)}"`
    return reference.kind === 'import' ? `@import url(${quoted})` : `url(${quoted})`
  })

  return { references, rewrite }
}

export const cssRefs = createCssRefs()
