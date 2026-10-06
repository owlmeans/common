import type { LlmPurpose } from '@owlmeans/llm-common'
import { AgentCodeLanguage, AgentMarkdownKind, AgentMessageCategory, AgentMessageRole, AgentStructuredKind } from './consts.js'

/**
 * Observability metadata attached to every model call. Extends the generic
 * `@owlmeans/llm-common` purpose (`type`, `dedication`) with viable's attribution fields.
 */
export interface PurposeMetadata extends LlmPurpose {
  viableAgent?: string
  viableHelper?: string
}

export interface AgentCodePresentation {
  category: AgentMessageCategory.Code | AgentMessageCategory.Diff
  language: AgentCodeLanguage
  role: AgentMessageRole
}

export interface AgentStructuredPresentation {
  category: AgentMessageCategory.Structured
  structure: AgentStructuredKind
  role: AgentMessageRole
}

export interface AgentMarkdownPresentation {
  category: AgentMessageCategory.Markdown
  document: AgentMarkdownKind
  role: AgentMessageRole
}

export interface AgentPlainPresentation {
  category: AgentMessageCategory.Plain
  role: AgentMessageRole
}

export type AgentMessagePresentation =
  | AgentCodePresentation
  | AgentStructuredPresentation
  | AgentMarkdownPresentation
  | AgentPlainPresentation

/** The attribution and content available to either side of a thinking event. */
export interface AgentMessageClassificationInput {
  agent?: string
  helper?: string
  action?: string
  outputType?: string
  text?: string
  value?: unknown
}
