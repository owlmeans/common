import type { FileProviderRef, LlmFileProvider } from './types.js'

/** Unwrap a {@link FileProviderRef} whichever form it arrived in. */
export const resolveFileProvider = (
  ref: FileProviderRef | undefined,
): LlmFileProvider | undefined => typeof ref === 'function' ? ref() : ref
