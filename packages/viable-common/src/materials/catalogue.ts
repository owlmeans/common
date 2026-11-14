import {
  MATERIAL_TEXT_EXTENSIONS, MATERIAL_TEXT_KINDS, MATERIAL_TEXT_MIMES, MATERIAL_USABLE_STATUSES, MATERIALS_INDEX_VERSION,
  MaterialGeneratedKind, MaterialStatus,
} from './consts.js'
import type {
  MaterialDetails, MaterialGeneratedDoc, MaterialIndexDocument, MaterialIndexEntry, MaterialRelevanceQuery, MaterialUse,
  ProjectMaterialRecord,
} from './types.js'
import type { MaterialIndexHelper } from './catalogue/types.js'
import {
  ENTRY_KEY_ORDER, FRONTMATTER_FENCE, GENERATED_HEAD, GENERATED_INTRO, GENERATED_KEY_ORDER, GENERATED_RULE,
  GENERATED_TITLE, INDEX_EMPTY, INDEX_INTRO, INDEX_TITLE, MENTION_AFTER, MENTION_BEFORE, SIZE_UNITS, TABLE_HEAD, TABLE_RULE,
  USE_KEY_ORDER,
} from './catalogue/consts.local.js'

/** Code-point order: `localeCompare` would make the output depend on the machine that rendered it. */
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const present = (value: unknown): boolean => value !== undefined && value !== null

/** A JSON value with every object's keys sorted, so equal details always serialize alike. */
const sortedValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortedValue)
  if (!isRecord(value)) return value

  return Object.fromEntries(Object.keys(value).sort(compare)
    .filter(key => present(value[key])).map(key => [key, sortedValue(value[key])]))
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const createMaterialIndexHelper = (): MaterialIndexHelper => {
  const useOf = (use: MaterialUse): MaterialUse => Object.fromEntries(
    USE_KEY_ORDER.filter(key => present(use[key])).map(key => [key, use[key]])
  ) as unknown as MaterialUse

  const entryOf = (record: ProjectMaterialRecord | MaterialIndexEntry): MaterialIndexEntry => {
    const source = record as unknown as Record<string, unknown>
    const entry: Record<string, unknown> = {}
    for (const key of ENTRY_KEY_ORDER) {
      const value = source[key]
      if (!present(value)) continue
      if (key === 'uses') {
        // Guarded rather than cast: `parse` hands this whatever a hand-edited index holds.
        if (Array.isArray(value)) entry.uses = value.filter(isRecord).map(use => useOf(use as unknown as MaterialUse))
      } else if (key === 'details') {
        if (isRecord(value)) entry.details = sortedValue(value) as MaterialDetails
      } else {
        entry[key] = value
      }
    }

    return entry as unknown as MaterialIndexEntry
  }

  const sortedEntries = (entries: Array<ProjectMaterialRecord | MaterialIndexEntry>): MaterialIndexEntry[] =>
    entries.map(entryOf).sort((a, b) => compare(a.path, b.path) || compare(a.name, b.name))

  const sizeOf = (bytes: number): string => {
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
      value /= 1024
      unit += 1
    }

    return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${SIZE_UNITS[unit]}`
  }

  /** A table cell: one line, no column breaks. */
  const cell = (text: string): string => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()

  const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``

  const rowOf = (entry: MaterialIndexEntry): string => {
    const file = [
      code(entry.path),
      ...(entry.from != null ? [`from ${code(entry.from)}`] : []),
      ...(entry.transcript != null ? [`text ${code(entry.transcript)}`] : []),
    ].join('<br>')
    const status = entry.status === MaterialStatus.Placed && entry.placedAt != null
      ? `placed at ${code(entry.placedAt)}`
      : entry.reason != null ? `${entry.status} (${entry.reason})` : entry.status
    const uses = (entry.uses ?? []).map(use => `${use.target} (${use.by})`).join(', ')
    const cells = [
      file, entry.purpose ?? '', entry.mime ?? entry.kind ?? '', sizeOf(entry.size), status, uses,
      entry.description ?? '',
    ]

    return `| ${cells.map(cell).join(' | ')} |`
  }

  const generatedOf = (doc: MaterialGeneratedDoc): MaterialGeneratedDoc => Object.fromEntries(
    GENERATED_KEY_ORDER.map(key => [key, doc[key]])
  ) as unknown as MaterialGeneratedDoc

  /** One document per path, sorted by path. */
  const sortedGenerated = (docs: MaterialGeneratedDoc[]): MaterialGeneratedDoc[] => {
    const byPath = new Map<string, MaterialGeneratedDoc>()
    for (const doc of docs) if (!byPath.has(doc.path)) byPath.set(doc.path, generatedOf(doc))

    return [...byPath.values()].sort((a, b) => compare(a.path, b.path))
  }

  const generatedRowOf = (doc: MaterialGeneratedDoc): string =>
    `| ${[code(doc.path), doc.kind, doc.title].map(cell).join(' | ')} |`

  const render = (entries: Array<ProjectMaterialRecord | MaterialIndexEntry>, generated: MaterialGeneratedDoc[] = []): string => {
    const sorted = sortedEntries(entries)
    const docs = sortedGenerated(generated)
    const document: MaterialIndexDocument = {
      version: MATERIALS_INDEX_VERSION, entries: sorted, ...(docs.length > 0 ? { generated: docs } : {}),
    }
    const table = sorted.length === 0 ? [INDEX_EMPTY] : [TABLE_HEAD, TABLE_RULE, ...sorted.map(rowOf)]
    const section = docs.length === 0
      ? []
      : [GENERATED_TITLE, '', GENERATED_INTRO, '', GENERATED_HEAD, GENERATED_RULE, ...docs.map(generatedRowOf), '']

    return [
      FRONTMATTER_FENCE, JSON.stringify(document, null, 2), FRONTMATTER_FENCE, '',
      INDEX_TITLE, '', INDEX_INTRO, '', ...table, '', ...section,
    ].join('\n')
  }

  const validEntry = (value: unknown): value is MaterialIndexEntry =>
    isRecord(value)
    && typeof value.path === 'string' && value.path !== ''
    && typeof value.name === 'string' && value.name !== ''
    && typeof value.size === 'number' && Number.isFinite(value.size)
    && Object.values(MaterialStatus).includes(value.status as MaterialStatus)

  /** The frontmatter object of a document, or `null` when it has none that parses. */
  const frontmatterOf = (markdown: string): Record<string, unknown> | null => {
    const lines = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
    if (lines[0]?.trim() !== FRONTMATTER_FENCE) return null
    const close = lines.findIndex((line, index) => index > 0 && line.trim() === FRONTMATTER_FENCE)
    if (close < 0) return null
    let document: unknown
    try {
      document = JSON.parse(lines.slice(1, close).join('\n'))
    } catch {
      return null
    }

    return isRecord(document) ? document : null
  }

  const parse = (markdown: string): MaterialIndexEntry[] => {
    const document = frontmatterOf(markdown)
    if (document == null || !Array.isArray(document.entries)) return []

    return document.entries.filter(validEntry).map(entryOf)
  }

  const parseGenerated = (markdown: string): MaterialGeneratedDoc[] => {
    const document = frontmatterOf(markdown)
    if (document == null || !Array.isArray(document.generated)) return []

    return sortedGenerated(document.generated.filter(isRecord)
      .filter(doc => typeof doc.path === 'string' && doc.path !== ''
        && Object.values(MaterialGeneratedKind).includes(doc.kind as MaterialGeneratedKind))
      .map(doc => ({
        path: doc.path as string,
        title: typeof doc.title === 'string' && doc.title !== '' ? doc.title : doc.path as string,
        kind: doc.kind as MaterialGeneratedKind,
      })))
  }

  /** Whether `name` occurs in `text` as a whole name — `logo.svg` in "use logo.svg.", not in "biglogo.svg". */
  const mentioned = (text: string, name: string): boolean =>
    new RegExp(`${MENTION_BEFORE}${escapeRegExp(name)}${MENTION_AFTER}`, 'i').test(text)

  const relevant = (entries: MaterialIndexEntry[], query: MaterialRelevanceQuery = {}): MaterialIndexEntry[] => {
    const usable = entries.filter(entry => MATERIAL_USABLE_STATUSES.includes(entry.status))
    const purposes = query.purposes ?? []
    const texts = (query.mentions ?? []).filter(text => text !== '')
    if (purposes.length === 0 && texts.length === 0) return usable

    return usable.filter(entry =>
      (entry.purpose != null && purposes.includes(entry.purpose))
      || texts.some(text => mentioned(text, entry.path) || mentioned(text, entry.name)))
  }

  const textual = (entry: ProjectMaterialRecord | MaterialIndexEntry): boolean => {
    const name = entry.name.toLowerCase()
    const dot = name.lastIndexOf('.')
    const mime = entry.mime ?? ''

    return MATERIAL_TEXT_KINDS.includes(entry.kind ?? '') || mime.startsWith('text/') || MATERIAL_TEXT_MIMES.includes(mime)
      || (dot > 0 && MATERIAL_TEXT_EXTENSIONS.includes(name.slice(dot + 1)))
  }

  return { entryOf, render, parse, parseGenerated, relevant, textual }
}

export const materialIndexHelper = createMaterialIndexHelper()
