import { FileKind } from '@owlmeans/upload'
import { EXTENSION_KINDS, TYPE_FAMILY_KINDS } from './kind/consts.local.js'
import type { UploadKindHelper } from './kind/types.js'

export const createUploadKindHelper = (): UploadKindHelper => {
  const guess: UploadKindHelper['guess'] = (name, type = '') => {
    const lower = name.toLowerCase()
    if (lower.endsWith('.tar.gz')) {
      return FileKind.Archive
    }
    const dot = lower.lastIndexOf('.')
    const byExtension = dot > 0 ? EXTENSION_KINDS[lower.slice(dot + 1)] : undefined
    if (byExtension != null) {
      return byExtension
    }
    const mime = type.toLowerCase()

    return TYPE_FAMILY_KINDS.find(([family]) => mime.startsWith(family))?.[1] ?? FileKind.Other
  }

  return { guess }
}

export const uploadKindHelper = createUploadKindHelper()
