import { COMPOUND_EXTENSIONS, NAME_STRIPPED_CHARACTERS, SAFE_NAME_FALLBACK, SAFE_NAME_MAX_LENGTH } from './names/consts.js'
import type { FileNameHelper, SafeNameOptions } from './names/types.js'

export const createFileNameHelper = (): FileNameHelper => {
  const baseOf = (name: string): string => name.split(/[\\/]/).pop() ?? ''

  const validExt = (ext: string | undefined): string | undefined => {
    const normalized = ext?.trim().replace(/^\.+/, '').toLowerCase()
    return normalized != null && /^[a-z0-9]+(\.[a-z0-9]+)?$/.test(normalized) ? normalized : undefined
  }

  const extOf = (name: string | undefined): string | undefined => {
    if (name == null) {
      return undefined
    }
    const lower = baseOf(name).trim().toLowerCase()
    const compound = COMPOUND_EXTENSIONS.find(ext => lower.endsWith(`.${ext}`) && lower.length > ext.length + 1)
    if (compound != null) {
      return compound
    }
    const dot = lower.lastIndexOf('.')

    return dot > 0 && dot < lower.length - 1 ? lower.slice(dot + 1) : undefined
  }

  const safe = (name: string, options: SafeNameOptions = {}): string => {
    const maxLength = options.maxLength ?? SAFE_NAME_MAX_LENGTH
    const cleaned = baseOf(name).normalize('NFC').replace(NAME_STRIPPED_CHARACTERS, '').replace(/[\n\t]/g, ' ')
      .replace(/[^\w.\- ()]/g, '_')
    const own = options.ext == null ? validExt(extOf(cleaned)) : undefined
    const ext = options.ext != null ? validExt(options.ext) : own
    const cut = options.ext != null ? cleaned.lastIndexOf('.') : own != null ? cleaned.length - own.length - 1 : -1
    const stem = (cut > 0 ? cleaned.slice(0, cut) : cleaned).replace(/^[.\s]+|[.\s]+$/g, '')
    const kept = stem.slice(0, Math.max(1, maxLength - (ext != null ? ext.length + 1 : 0))).trim()
    const base = kept !== '' ? kept : options.fallback ?? SAFE_NAME_FALLBACK

    return ext != null ? `${base}.${ext}` : base
  }

  return { safe, extOf }
}

export const fileNameHelper = createFileNameHelper()
