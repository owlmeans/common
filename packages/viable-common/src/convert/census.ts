import { EntropyClass, FileClass, SizeClass, SIZE_CLASS_BOUNDS } from './consts.js'
import {
  BINARY_EXTENSIONS, BULK_HINTS, DATA_AMBIGUOUS_EXT, DATA_OVERRIDABLE, EXT_CLASS, GENERATED_SEGMENTS, LOCK_NAMES,
  MANIFEST_NAMES, SEED_HINTS, TEST_SEGMENTS, TEXT_EXTENSIONS
} from './census/consts.local.js'
import type { CensusHelper } from './census/types.js'

export const createCensusHelper = (): CensusHelper => {
  const sizeClassOf = (bytes: number): SizeClass => {
    if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Tiny]) return SizeClass.Tiny
    if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Small]) return SizeClass.Small
    if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Medium]) return SizeClass.Medium
    if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Large]) return SizeClass.Large

    return SizeClass.Huge
  }

  const segmentsOf = (path: string): string[] => path.split('/').filter(part => part !== '')

  const hasSegment = (path: string, of: string[]): boolean =>
    segmentsOf(path).some(part => of.includes(part.toLowerCase()))

  const fileClassOf = (path: string, ext: string): FileClass => {
    const lower = path.toLowerCase()
    const base = segmentsOf(lower).pop() ?? lower
    const tail = (ext.startsWith('.') ? ext.slice(1) : ext).toLowerCase()

    if (LOCK_NAMES.includes(base)) return FileClass.Lock
    if (hasSegment(lower, GENERATED_SEGMENTS)) return FileClass.Generated
    if (MANIFEST_NAMES.includes(base)) return FileClass.Manifest
    if (hasSegment(lower, TEST_SEGMENTS) || base.includes('.test.') || base.includes('.spec.')) {
      return FileClass.Test
    }
    if (base.startsWith('.env')) return FileClass.Config

    const byExt = EXT_CLASS[tail] ?? FileClass.Unknown
    if (
      (DATA_OVERRIDABLE.includes(byExt) || DATA_AMBIGUOUS_EXT.includes(tail))
      && (isSeedPath(lower) || isBulkPath(lower))
    ) {
      return FileClass.Data
    }

    return byExt
  }

  const binaryByExtension = (path: string): boolean | null => {
    const base = segmentsOf(path).pop() ?? path
    const dot = base.lastIndexOf('.')
    if (dot < 1) return null
    const ext = base.slice(dot).toLowerCase()

    return TEXT_EXTENSIONS.includes(ext) ? false : BINARY_EXTENSIONS.includes(ext) ? true : null
  }

  const entropyClassOf = (head: string): EntropyClass => {
    if (head.length < 1) return EntropyClass.Text

    let printable = 0
    let whitespace = 0
    for (const char of head) {
      const code = char.codePointAt(0) ?? 0
      if (code === 9 || code === 10 || code === 13 || code === 32) {
        ++whitespace
        ++printable
      } else if (code >= 32 && code !== 127) {
        ++printable
      }
    }

    const ratio = printable / head.length
    if (ratio < 0.85) return EntropyClass.Opaque
    // Prose, code and markup all break lines and indent. A body that does neither is minified,
    // encoded or packed — printable, and not something a model can reason over.
    if (whitespace / head.length < 0.05) return EntropyClass.Dense

    return EntropyClass.Text
  }

  const matchesHint = (path: string, hints: string[]): boolean => {
    const lower = path.toLowerCase()
    if (hasSegment(lower, hints)) return true
    const base = segmentsOf(lower).pop() ?? lower

    return hints.some(hint => base.includes(hint))
  }

  const isBulkPath = (path: string): boolean => matchesHint(path, BULK_HINTS)

  const isSeedPath = (path: string): boolean => matchesHint(path, SEED_HINTS)

  return { sizeClassOf, fileClassOf, binaryByExtension, entropyClassOf, isBulkPath, isSeedPath }
}

export const censusHelper = createCensusHelper()
