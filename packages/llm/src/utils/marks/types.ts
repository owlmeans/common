import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { CacheTtl, CacheTtlPolicy } from '@owlmeans/llm-common'
import type { LlmLoopCacheHints, LlmSystemBlock, PromptBoundary, PromptPatch } from '../../plugins/types.js'
import type { ResolvedCacheTtl } from '../../prompt/types.js'

/** How one provider writes a breakpoint — the only part of placing markers that differs. */
export interface MarkDialect {
  /** One text block of the split system message, marked when a boundary closes it. */
  block: (text: string, boundary?: PromptBoundary) => Record<string, unknown>
  /** A copy of a message carrying the marker for this boundary. */
  message: (msg: MessageFieldWithRole, boundary: PromptBoundary) => MessageFieldWithRole
}

/** One piece of a system message split at its breakpoints. */
export interface SystemSegment {
  text: string
  /** The boundary closing this segment, when one is marked there. */
  boundary?: PromptBoundary
}

/** The opening of a tool loop — what a round marks before the conversation grows. */
export interface LoopOpening {
  /** The blocks the system message is split from; empty when it is marked as one message. */
  system: LlmSystemBlock[]
  boundaries: PromptBoundary[]
}

/** Where cache breakpoints may go, and which of them a plugin places — provider-neutral. */
export interface MarkUtils {
  /** A lifetime for every breakpoint, from one that names a single lifetime for all of them. */
  ttlPolicyOf: (ttl: CacheTtl | CacheTtlPolicy | undefined) => CacheTtlPolicy
  /**
   * Resolve cache lifetimes: `'5m'` everywhere, then each layer key by key (a string sets every
   * key), then clamped so no lifetime is longer than the one before it.
   */
  resolveTtl: (...layers: Array<CacheTtl | CacheTtlPolicy | undefined>) => ResolvedCacheTtl
  /**
   * The breakpoints of a system message joined from `blocks` (message 0): role + skills, then
   * packages — or, for a system holding neither, one at its end, as the project facts.
   */
  systemBoundaries: (blocks: readonly LlmSystemBlock[], ttl: ResolvedCacheTtl) => PromptBoundary[]
  /** The stable opening of a tool loop: the system message at its boundaries and the project message. */
  loopOpening: (
    wire: readonly MessageFieldWithRole[], hints: LlmLoopCacheHints, ttl: ResolvedCacheTtl,
  ) => LoopOpening
  /** The boundaries to mark: those whose prefix reaches `minChars`, earliest first, at most `budget`. */
  select: (boundaries: readonly PromptBoundary[], minChars: number, budget: number) => PromptBoundary[]
  /** The system message's text, split after each chosen boundary inside it. */
  segments: (blocks: readonly LlmSystemBlock[], chosen: readonly PromptBoundary[]) => SystemSegment[]
  /**
   * Place the chosen breakpoints in a provider's dialect: inside the system message by rendering
   * it as one block per segment, on any other message through the dialect's own marking. Every
   * marked message is a new object; the list handed in is not edited.
   */
  render: (
    messages: readonly MessageFieldWithRole[], system: readonly LlmSystemBlock[],
    chosen: readonly PromptBoundary[], dialect: MarkDialect,
  ) => PromptPatch
}
