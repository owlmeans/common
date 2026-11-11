import { FileMimicryError, fileInspector } from '@owlmeans/file-inspector'
import type { FileInspector, FileVerdict } from '@owlmeans/file-inspector'
import { logger } from '@owlmeans/log'
import { REFUSED_INCONCLUSIVE_REASONS, UPLOAD_VERIFY_POLICY } from './verify/consts.js'
import type { UploadClaims, VerifyUtils } from './verify/types.js'

const log = logger('storage-resource')

export const createVerifyUtils = (inspector: FileInspector = fileInspector): VerifyUtils => {
  /**
   * The stored object answers with the declared media type, so a signature that names another
   * format of the same kind (a png declared `image/jpeg`) contradicts it. Text formats carry no
   * signature and are judged by kind alone.
   */
  const formatDiffers = (verdict: FileVerdict): boolean => {
    const { declared, detected } = verdict
    if (verdict.details.formatDiffers != null) {
      return true
    }
    if (detected?.method !== 'signature' || declared.mime == null) {
      return false
    }

    return inspector.kindOf(declared.mime) === detected.kind && inspector.normalizeMime(detected.mime) !== declared.mime
  }

  const refused = (verdict: FileVerdict): boolean => verdict.status === 'mismatch'
    || (verdict.status === 'inconclusive' && verdict.reasons.some(reason => REFUSED_INCONCLUSIVE_REASONS.includes(reason)))
    || (verdict.status === 'match' && formatDiffers(verdict))

  const verify = async (head: Uint8Array, claims: UploadClaims): Promise<FileVerdict> => {
    const verdict = await inspector.inspect(
      head, { name: claims.name, mime: claims.mime }, { complete: claims.complete, size: claims.size }
    )
    inspector.enforce(verdict, UPLOAD_VERIFY_POLICY)
    if (refused(verdict)) {
      log.warn('Refused an upload its bytes contradict', {
        claimed: verdict.declared.mime ?? verdict.declared.ext ?? 'unclaimed',
        detected: verdict.detected?.mime ?? 'unknown',
        reasons: verdict.reasons,
      }, { event: 'storage-resource.mime-mismatch' })
      throw new FileMimicryError('mime-mismatch')
    }

    return verdict
  }

  return { verify }
}

export const verifyUtils = createVerifyUtils()
