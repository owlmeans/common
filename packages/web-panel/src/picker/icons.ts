import type { LucideIcon } from 'lucide-react'
import { PICKER_ICONS } from './icons/consts.js'
import type { PickerIconHelper } from './icons/types.js'
import { PICKER_FALLBACK_ICON, PICKER_ICON_ENTRIES } from './vocabulary/consts.js'
import type { PickerIconCategory, PickerIconEntry } from './vocabulary/types.js'

export const createPickerIconHelper = (): PickerIconHelper => {
  const wordsOf = (text: string): string[] => text.toLowerCase().split(/[\s,-]+/).filter(word => word !== '')
  const byName = new Map(PICKER_ICON_ENTRIES.map(entry => [entry.name, entry]))
  // Each entry's words split once: its name's and its search words'.
  const words = new Map(PICKER_ICON_ENTRIES.map(entry => [entry.name, {
    name: wordsOf(entry.name), search: entry.keywords.flatMap(wordsOf),
  }]))
  const fallback = PICKER_ICONS[PICKER_FALLBACK_ICON]

  const has = (name: unknown): name is string =>
    typeof name === 'string' && Object.prototype.hasOwnProperty.call(PICKER_ICONS, name)

  const iconOf = (name?: string | null): LucideIcon => has(name) ? PICKER_ICONS[name] : fallback

  const scope = (names?: readonly string[]): PickerIconEntry[] => names == null
    ? [...PICKER_ICON_ENTRIES]
    : names.flatMap(name => {
      const entry = byName.get(name)

      return entry != null ? [entry] : []
    })

  /** 0 exact name, 1 name prefix, 2 a name word, 3 a search word, 4 the category; -1 no match. */
  const rank = (entry: PickerIconEntry, query: string, terms: string[]): number => {
    if (entry.name === query) {
      return 0
    }
    const own = words.get(entry.name) ?? { name: [], search: [] }
    const starts = (pool: string[]) => terms.every(term => pool.some(word => word.startsWith(term)))
    if (!starts([...own.name, ...own.search, entry.category])) {
      return -1
    }
    if (entry.name.startsWith(query.replace(/\s+/g, '-'))) {
      return 1
    }
    if (starts(own.name)) {
      return 2
    }

    return starts([...own.name, ...own.search]) ? 3 : 4
  }

  const search = (query: string, names?: readonly string[]): PickerIconEntry[] => {
    const entries = scope(names)
    const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ')
    if (normalized === '') {
      return entries
    }
    const terms = wordsOf(normalized)

    return entries
      .map((entry, order) => ({ entry, order, score: rank(entry, normalized, terms) }))
      .filter(hit => hit.score >= 0)
      .sort((a, b) => a.score - b.score || a.order - b.order)
      .map(hit => hit.entry)
  }

  const byCategory = (category: PickerIconCategory, names?: readonly string[]): PickerIconEntry[] =>
    scope(names).filter(entry => entry.category === category)

  return { iconOf, has, search, byCategory }
}

export const pickerIconHelper = createPickerIconHelper()
