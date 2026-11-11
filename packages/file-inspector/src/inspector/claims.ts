import { fileNameHelper } from '../names.js'
import type { FileKind } from '../consts.js'
import type { DeclaredType, FileClaims } from './types.js'
import type { ClaimReader } from './types.local.js'
import { EXTENSION_MIME } from './consts.js'

/** Reads a name and a declared media type into the kinds they claim. */
export const makeClaimReader = (
  normalizeMime: (mime: string | undefined) => string | undefined,
  kindOf: (mime: string | undefined, ext?: string) => FileKind
): ClaimReader => {
  const read = (claims: FileClaims): DeclaredType => {
    const ext = fileNameHelper.extOf(claims.name)
    const extMime = ext != null ? EXTENSION_MIME[ext] : undefined
    const mime = normalizeMime(claims.mime)
    const kinds: FileKind[] = []
    if (extMime != null) {
      kinds.push(kindOf(extMime, ext))
    }
    if (mime != null) {
      const kind = kindOf(mime)
      if (!kinds.includes(kind)) {
        kinds.push(kind)
      }
    }

    return { ext, extMime, mime, kinds }
  }

  return { read }
}
