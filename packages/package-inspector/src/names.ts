import {
  PACKAGE_NAME_ALPHABET, PACKAGE_NAME_MAX_LENGTH, PACKAGE_NAME_PATTERN, PACKAGE_NAME_PREFIXES,
  PACKAGE_NAME_SEPARATORS, PACKAGE_NAME_SUFFIXES, PACKAGE_VARIANT_LIMIT,
} from './names/consts.js'
import type { PackageNameHelper, PackageNameParts } from './names/types.js'

export const createPackageNameHelper = (): PackageNameHelper => {
  const split: PackageNameHelper['split'] = name => {
    const text = name.trim().toLowerCase()
    const slash = text.indexOf('/')
    if (text.startsWith('@') && slash > 1) {
      return { scope: text.slice(1, slash), base: text.slice(slash + 1) }
    }

    return { base: text }
  }

  const join = (parts: PackageNameParts): string => parts.scope != null ? `@${parts.scope}/${parts.base}` : parts.base

  const isValid: PackageNameHelper['isValid'] = name =>
    name.length > 0 && name.length <= PACKAGE_NAME_MAX_LENGTH && PACKAGE_NAME_PATTERN.test(name)

  const distance: PackageNameHelper['distance'] = (a, b) => {
    if (a === b) {
      return 0
    }
    if (a.length === 0 || b.length === 0) {
      return a.length + b.length
    }
    // The unrestricted Damerau-Levenshtein table, shifted by one row and column for the sentinel.
    const infinity = a.length + b.length
    const table: number[][] = Array.from({ length: a.length + 2 }, () => new Array<number>(b.length + 2).fill(0))
    table[0][0] = infinity
    for (let i = 0; i <= a.length; i++) {
      table[i + 1][0] = infinity
      table[i + 1][1] = i
    }
    for (let j = 0; j <= b.length; j++) {
      table[0][j + 1] = infinity
      table[1][j + 1] = j
    }
    const lastRow = new Map<string, number>()
    for (let i = 1; i <= a.length; i++) {
      let lastColumn = 0
      for (let j = 1; j <= b.length; j++) {
        const i1 = lastRow.get(b[j - 1]) ?? 0
        const j1 = lastColumn
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        if (cost === 0) {
          lastColumn = j
        }
        table[i + 1][j + 1] = Math.min(
          table[i][j] + cost,
          table[i + 1][j] + 1,
          table[i][j + 1] + 1,
          table[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1),
        )
      }
      lastRow.set(a[i - 1], i)
    }

    return table[a.length + 1][b.length + 1]
  }

  const normalise: PackageNameHelper['normalise'] = name => split(name).base.replace(/[-._]/g, '')

  const stem: PackageNameHelper['stem'] = name => {
    let text = normalise(name)
    if (text.startsWith('node') && text.length > 6) {
      text = text.slice(4)
    }
    if (text.endsWith('js') && text.length > 4) {
      text = text.slice(0, -2)
    }

    return text
  }

  const related: PackageNameHelper['related'] = (a, b, maxDistance = 2) =>
    stem(a) === stem(b) || distance(normalise(a), normalise(b)) <= maxDistance

  /** Each separator swapped for the others or dropped — one at a time, then all at once. */
  const swapsOf = (text: string): string[] => {
    const out: string[] = []
    for (let i = 0; i < text.length; i++) {
      if (PACKAGE_NAME_SEPARATORS.includes(text[i])) {
        for (const separator of PACKAGE_NAME_SEPARATORS) {
          out.push(text.slice(0, i) + separator + text.slice(i + 1))
        }
        out.push(text.slice(0, i) + text.slice(i + 1))
      }
    }
    if (out.length > 0) {
      for (const separator of [...PACKAGE_NAME_SEPARATORS, '']) {
        out.push(text.replace(/[-._]/g, separator))
      }
    }

    return out
  }

  /** The base with the common suffixes and prefixes added or dropped. */
  const affixesOf = (text: string): string[] => {
    const suffix = [...PACKAGE_NAME_SUFFIXES].sort((x, y) => y.length - x.length)
      .find(candidate => text.endsWith(candidate) && text.length > candidate.length + 1)
    const core = suffix != null ? text.slice(0, -suffix.length) : text
    const out = [core, ...PACKAGE_NAME_SUFFIXES.map(candidate => core + candidate)]
    for (const prefix of PACKAGE_NAME_PREFIXES) {
      out.push(text.startsWith(prefix) && text.length > prefix.length + 1 ? text.slice(prefix.length) : prefix + text)
    }

    return out
  }

  const transpositionsOf = (text: string): string[] => {
    const out: string[] = []
    for (let i = 0; i < text.length - 1; i++) {
      if (text[i] !== text[i + 1]) {
        out.push(text.slice(0, i) + text[i + 1] + text[i] + text.slice(i + 2))
      }
    }

    return out
  }

  const deletionsOf = (text: string): string[] =>
    text.length < 2 ? [] : Array.from({ length: text.length }, (_, i) => text.slice(0, i) + text.slice(i + 1))

  const substitutionsOf = (text: string): string[] => {
    const out: string[] = []
    for (let i = 0; i < text.length; i++) {
      for (const char of PACKAGE_NAME_ALPHABET) {
        if (char !== text[i]) {
          out.push(text.slice(0, i) + char + text.slice(i + 1))
        }
      }
    }

    return out
  }

  const insertionsOf = (text: string): string[] => {
    const out: string[] = []
    for (let i = 0; i <= text.length; i++) {
      for (const char of PACKAGE_NAME_ALPHABET) {
        out.push(text.slice(0, i) + char + text.slice(i))
      }
    }

    return out
  }

  const variants: PackageNameHelper['variants'] = (name, options = {}) => {
    const limit = options.limit ?? PACKAGE_VARIANT_LIMIT
    const parts = split(name)
    const self = join(parts)
    const seen = new Set<string>([self])
    const out: string[] = []

    const usable = (part: string): boolean =>
      part !== '' && !part.startsWith('-') && !PACKAGE_NAME_SEPARATORS.includes(part[part.length - 1])

    const add = (candidate: PackageNameParts): boolean => {
      if (out.length >= limit) {
        return false
      }
      if (!usable(candidate.base) || (candidate.scope != null && !usable(candidate.scope))) {
        return true
      }
      const joined = join(candidate)
      if (!seen.has(joined) && isValid(joined)) {
        seen.add(joined)
        out.push(joined)
      }

      return true
    }
    const ofBase = (edits: string[]): boolean => edits.every(base => add({ ...parts, base }))
    const ofScope = (edits: string[]): boolean => parts.scope == null || edits.every(scope => add({ scope, base: parts.base }))

    // Most likely first: every bucket stops the walk once the bound is reached.
    void ((parts.scope == null || add({ base: parts.base }))
      && ofBase(swapsOf(parts.base))
      && ofBase(affixesOf(parts.base))
      && ofScope(swapsOf(parts.scope ?? ''))
      && ofBase(transpositionsOf(parts.base))
      && ofScope(transpositionsOf(parts.scope ?? ''))
      && ofBase(deletionsOf(parts.base))
      && ofScope(deletionsOf(parts.scope ?? ''))
      && ofBase(substitutionsOf(parts.base))
      && ofBase(insertionsOf(parts.base)))

    return out
  }

  return { split, isValid, distance, normalise, stem, related, variants }
}

export const packageNameHelper = createPackageNameHelper()
