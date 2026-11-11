import type { FileKind } from '@owlmeans/upload'

/** The kind of a file still on the person's device — a guess for the list's icon, replaced by the server's detected kind. */
export interface UploadKindHelper {
  /** From the extension of the name, else the media type's family; `other` when neither says. */
  guess: (name: string, type?: string) => FileKind
}
