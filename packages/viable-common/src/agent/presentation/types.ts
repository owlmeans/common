import type { AgentCodeLanguage, AgentMessageRole } from '../consts.js'
import type { AgentMessageClassificationInput, AgentMessagePresentation } from '../types.js'

/** How an agent's thinking event is presented: its specialist family, its language, its card. */
export interface AgentPresentationHelper {
  /**
   * Source extraction is an internal context-reduction pass. Its terminal tool call contains only
   * line ranges, which are useful to the coder but add no useful information to a person's journal.
   */
  isAgentMessageHidden: (input: AgentMessageClassificationInput) => boolean
  /** Maps the attribution that reached the event boundary to the visual specialist family. */
  agentMessageRoleOf: (input: AgentMessageClassificationInput) => AgentMessageRole
  /** Pulls a schema argument out of LangChain's serialised tool-call shape. */
  agentToolCallArguments: (value: unknown) => unknown
  /** Finds the language of a unified diff from its destination (or source) file path. */
  agentDiffLanguageOf: (text: string) => AgentCodeLanguage
  /** Conservative code detection; prose with one identifier remains plain text. */
  agentCodeLanguageOf: (text: string) => AgentCodeLanguage
  isUnifiedDiff: (text: string) => boolean
  classifyAgentMessage: (input: AgentMessageClassificationInput) => AgentMessagePresentation
}
