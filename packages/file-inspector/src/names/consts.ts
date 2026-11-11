/** Extensions that span two dots and name one format. */
export const COMPOUND_EXTENSIONS: readonly string[] = Object.freeze(['tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst'])

/** The longest safe name, extension included. */
export const SAFE_NAME_MAX_LENGTH = 100

/** The stem of a safe name when nothing of the reported name is left. */
export const SAFE_NAME_FALLBACK = 'file'

/**
 * Characters a safe name drops: C0 controls but `\t` and `\n` (those become spaces), DEL, C1
 * controls, bidirectional embeddings, overrides, isolates and marks, zero-width characters.
 */
export const NAME_STRIPPED_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠⁦-⁩﻿]/g
