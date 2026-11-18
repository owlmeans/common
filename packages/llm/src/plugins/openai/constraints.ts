import {
  CONSTRAINT_NOTES, NOTE_VALUE, NULLABLE_NOTE, REQUIRED_NOTE, SCHEMA_KEYWORDS, SCHEMA_LIST_KEYWORDS, SCHEMA_MAP_KEYWORDS,
} from './constraints/consts.js'
import type { OpenAiConstraintsHelper } from './constraints/types.js'

const isNode = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/** A copy of a value in a non-schema position: JSON in, JSON out. */
const copyOf = (value: unknown): unknown =>
  value != null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) as unknown : value

export const createOpenAiConstraintsHelper = (): OpenAiConstraintsHelper => {
  const notesOf = (node: Record<string, unknown>, required: boolean): string[] => {
    const notes: string[] = []
    if (required) notes.push(REQUIRED_NOTE)
    if (node.nullable === true) notes.push(NULLABLE_NOTE)
    for (const [keyword, note] of CONSTRAINT_NOTES) {
      const value = node[keyword]
      const shown = typeof value === 'number' || (typeof value === 'string' && value !== '')
      if (shown) notes.push(note.replace(NOTE_VALUE, String(value)))
    }

    return notes
  }

  const foldNode = (node: unknown, required = false): unknown => {
    if (!isNode(node)) return copyOf(node)
    const requiredKeys = Array.isArray(node.required) ? node.required : []
    const folded: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      if (SCHEMA_MAP_KEYWORDS.has(key) && isNode(value)) {
        folded[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [
          name, foldNode(child, key === 'properties' && requiredKeys.includes(name)),
        ]))
      } else if ((SCHEMA_LIST_KEYWORDS.has(key) || key === 'items') && Array.isArray(value)) {
        folded[key] = value.map(child => foldNode(child))
      } else if (SCHEMA_KEYWORDS.has(key) && isNode(value)) {
        folded[key] = foldNode(value)
      } else {
        folded[key] = copyOf(value)
      }
    }
    const notes = notesOf(node, required)
    if (notes.length > 0) {
      const own = typeof node.description === 'string' && node.description.trim() !== '' ? [node.description.trim()] : []
      folded.description = [...own, ...notes].join(' ')
    }

    return folded
  }

  const fold = (schema: unknown): unknown => foldNode(schema)

  return { fold }
}

export const openAiConstraintsHelper = createOpenAiConstraintsHelper()
