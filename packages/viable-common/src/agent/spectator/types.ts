import type { SpectatorEntry as LlmSpectatorEntry } from '@owlmeans/llm-common'
import type { SpectatorEntryKind } from './consts.js'
import type { PurposeMetadata } from '../types.js'

/**
 * The spectator record contracts are owned by `@owlmeans/llm-common`; viable narrows
 * `kind` and `purpose` to its own enums on {@link SpectatorEntry}.
 */
export type { SpectatorArgument, SpectatorEntryMessage } from '@owlmeans/llm-common'

export interface SpectatorEntry extends LlmSpectatorEntry {
  kind: SpectatorEntryKind
  purpose: PurposeMetadata
}
