import type { LucideIcon } from 'lucide-react'
import type { PickerIconCategory, PickerIconEntry } from '../vocabulary/types.js'

/** Looks icons up and searches the catalogue. */
export interface PickerIconHelper {
  /** The component for a stored name; unknown, empty or absent → the fallback icon (`circle`). */
  iconOf: (name?: string | null) => LucideIcon
  /** Whether a value names a catalogue icon. */
  has: (name: unknown) => name is string
  /**
   * Catalogue entries matching a query — every word must start a word of the name, a search word or
   * the category; the closest names first. An empty query lists them all. `names` narrows the
   * catalogue and sets the order (an application's own icon list).
   */
  search: (query: string, names?: readonly string[]) => PickerIconEntry[]
  /** The entries of one category, in catalogue order (or `names`' order). */
  byCategory: (category: PickerIconCategory, names?: readonly string[]) => PickerIconEntry[]
}
