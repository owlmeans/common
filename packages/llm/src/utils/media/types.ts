import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { MediaKind, MediaNeeds, MediaPlaceholder } from '@owlmeans/llm-common'
import type { LlmPlugin } from '../../plugins/types.js'
import type { MediaPart } from '../../helpers/media/types.js'
import type { ModelConfig } from '../../types.js'
import type { Rung } from '../rungs/types.js'

/** The payload a content block embeds — base64 or bytes, never both. */
export interface BinaryPayload {
  kind: MediaKind
  mime: string
  base64?: string
  bytes?: Uint8Array
}

/** Reading, rewriting and redacting media content parts in any provider's spelling. Library-private. */
export interface MediaUtils {
  /** What media a content block stands for — embedded or by URL — or `undefined` for text and everything else. */
  kindOf: (block: unknown) => MediaKind | undefined
  /** The payload a block embeds; `undefined` for text and for media referenced by URL. */
  binaryOf: (block: unknown) => BinaryPayload | undefined
  /** A neutral part (langchain standard image / file block with inline data), normalized to base64. */
  neutralOf: (block: unknown) => MediaPart | undefined
  /** Whether the content embeds any payload, nested tool results included. */
  hasBinary: (content: unknown) => boolean
  /** The placeholder a trace stores instead of a payload. */
  placeholderOf: (payload: BinaryPayload) => MediaPlaceholder
  /** The content with every payload replaced by its placeholder; the same reference when there was none. */
  redactContent: <T>(content: T) => T
  /**
   * The message as a recorder stores it: itself when it embeds nothing, otherwise a JSON-equivalent
   * copy (a langchain message's `toJSON()` form) carrying the redacted content.
   */
  redactMessage: (message: unknown) => unknown
  /** What the messages need from the model that answers them. */
  needsOf: (messages: readonly MessageFieldWithRole[]) => MediaNeeds
  /**
   * The rungs a call with these needs may run on, in ladder order — all of them when it needs
   * nothing. `LlmMediaUnsupportedError` when none accepts it.
   */
  ladderFor: (rungs: Rung[], needs: MediaNeeds) => Rung[]
  /**
   * In place, on prepared copies: every neutral part rewritten into the rung plugin's spelling, then
   * every payload checked against the accepted image types, `MEDIA_LIMITS` and the plugin's request
   * limits (`LlmMediaTypeError`, `LlmMediaLimitError`).
   */
  render: (messages: MessageFieldWithRole[], plugin: LlmPlugin | undefined, config: Partial<ModelConfig>) => void
}
