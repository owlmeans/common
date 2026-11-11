import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage, MessageFieldWithRole } from '@langchain/core/messages'
import type { MediaNeeds, RungCapabilities } from '@owlmeans/llm-common'

/** The model of a role's ladder that answers one run, and what it accepts. */
export interface AnsweringRung {
  /** The UNBOUND model: tools are bound to it, its provider plugin marks the rounds, media is spelled for it. */
  model: BaseChatModel
  /** `0` for the primary, otherwise the fallback's position on the ladder. */
  index: number
  /** What it accepts — `ModelConfig.vision` / `documents` of its config; unset means no. */
  capabilities: RungCapabilities
}

/** Images and PDFs in the agent loop. Package-private. */
export interface LoopMediaUtils {
  /** What the neutral media parts (`mediaHelper.image` / `document`) of the messages need from the model. */
  needsOf: (messages: readonly BaseMessage[]) => MediaNeeds
  /**
   * The rung a run carrying these needs is answered by: the primary when it accepts them (or there
   * are none), else the first fallback that does — the ladder `makeLlmModel` filters per call.
   * `LlmMediaUnsupportedError` when no rung accepts them.
   */
  answering: (model: BaseChatModel, needs: MediaNeeds) => AnsweringRung
  /**
   * Copies of one round's messages with every neutral part spelled for the answering model's
   * provider and checked against its request limits (`mediaHelper.render`).
   * `LlmMediaUnsupportedError` when the round carries media the rung does not accept.
   */
  render: (messages: readonly BaseMessage[], rung: AnsweringRung) => MessageFieldWithRole[]
  /**
   * A tool's output as the text of its result. A tool cannot hand the model an image: a binary part
   * in what it returned is replaced by its placeholder `{ type, mime, bytes, sha256 }`, never sent
   * as base64 text.
   */
  toolText: (output: unknown) => string
}
