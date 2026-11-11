import { FileKind } from '@owlmeans/file-inspector'
import type { VerifyPolicy } from '@owlmeans/file-inspector'

/** What the inspector itself refuses: dangerous content and executables. Mismatches are judged here. */
export const UPLOAD_VERIFY_POLICY: Readonly<VerifyPolicy> = Object.freeze({
  refuse: [FileKind.Executable],
  refuseMismatch: false,
})

/** Inconclusive reasons an upload is refused for: nothing claimed, or a binary no signature knows. */
export const REFUSED_INCONCLUSIVE_REASONS: readonly string[] = Object.freeze(['no-claim', 'unrecognized'])
