import type { LlmPurpose } from '@owlmeans/llm-common'

/**
 * Observability metadata attached to every model call. Extends the generic
 * `@owlmeans/llm-common` purpose (`type`, `dedication`) with viable's attribution fields.
 */
export interface PurposeMetadata extends LlmPurpose {
  viableAgent?: string
  viableHelper?: string
}
