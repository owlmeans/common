import type { AIMessage, AIMessageChunk, MessageFieldWithRole } from '@langchain/core/messages'
import type { LlmPurpose, NullKind, SpectatorEntryLogged } from '@owlmeans/llm-common'
import type { LlmModelError } from '../../errors.js'
import type { FatalErrorResolver } from '../../helpers/retry/types.js'
import type { ActiveRung, PrepareRequest, PreparedRequest } from '../../types.local.js'
import type { LlmCallTools, LlmSpectator, LlmToolConversation, ModelConfig, ModelInput } from '../../types.js'
import type { CallAttempts } from '../attempts/types.js'
import type { CallGuidance } from '../guidance/types.js'
import type { NullReportParams } from '../null-report/types.js'
import type { Rung } from '../rungs/types.js'
import type { StreamLiveness } from '../stream/types.js'

/**
 * Where one attempt's conversation stands: looking (look-ups run), spent (the budget is gone, a stop
 * tool is still callable, a look-up ends it unrun) or final (the next answer is the answer — `ask`
 * asks it with no tool bound, `invoke` with its output tool pinned).
 */
export type RoundPhase = 'look' | 'spent' | 'final'

/** What a model lends the tool rounds of its calls — bound once, by `makeLlmModel`. */
export interface RoundsHost {
  purpose: LlmPurpose
  spectator: LlmSpectator
  /** The model's own preparation of a request for one rung. */
  prepare: (request: PrepareRequest, rung: Rung) => Promise<PreparedRequest>
  /**
   * One plain request on a rung — no tools bound — streamed under the attempt's deadlines, a null
   * result diagnosed (a climb of `attempts`) and the turn spectated under `action`: the call's own
   * `ask` path.
   */
  answer: (
    active: ActiveRung, request: PreparedRequest, action: string, attempt: number, attempts: CallAttempts, stable?: number,
  ) => Promise<RoundsAnswer>
  /** What arms a stream's progress deadline on this rung: the attempt's observer — none without a plugin. */
  liveness: (active: ActiveRung) => StreamLiveness | undefined
  /** Record a call that produced nothing usable and build its retryable error. */
  nullResult: (
    kind: NullKind, config: Partial<ModelConfig>, params: Omit<NullReportParams, 'kind' | 'purpose' | 'config'>,
    parsed?: boolean,
  ) => Promise<LlmModelError>
}

/** The structured-output tool of an `invoke` that converses. */
export interface RoundsOutput {
  toolName: string
  innerSchema: unknown
}

/** One call made with {@link LlmCallTools}. */
export interface RoundsCall<T> {
  kind: 'ask' | 'invoke'
  tools: LlmCallTools<T>
  action: string
  /** The caller's input, untouched. */
  input: ModelInput
  /** What a rung that converses is prepared from — for `invoke` it asks for the output tool, never a tail schema. */
  request: PrepareRequest
  /** The call's cached preparation of {@link request}. */
  prepared: (rung: Rung) => Promise<PreparedRequest>
  fatal?: FatalErrorResolver
  /**
   * The call's escalation state: a turn that comes back with nothing is a climb, exactly as a plain
   * call's null result — the rounds run inside one attempt of this ladder.
   */
  attempts: CallAttempts
  /** `invoke` only. */
  output?: RoundsOutput
}

/** The turn that answered: what the call's usual path takes over. */
export interface RoundsAnswer {
  /** Its completion, cache tiers applied. */
  piece: AIMessageChunk
  message: AIMessage
  /** The request the turn sent. */
  msgs: MessageFieldWithRole[]
  placed: number
  startedAt: number
  entry: SpectatorEntryLogged
  /** `invoke`: the output tool's arguments, or JSON recovered from the content; `null` when neither. */
  result?: unknown
}

/** A stop tool ended the call. */
export interface RoundsStop<T> {
  value: T
  message: AIMessage
  entry: SpectatorEntryLogged
}

/** The attempt's conversation reached its answer. */
export interface RoundsAnswered {
  answer: RoundsAnswer
}

/** A stop tool ended the attempt — and the call. */
export interface RoundsStopped<T> {
  stopped: RoundsStop<T>
}

/** How one attempt's conversation ended. */
export type RoundsOutcome<T> = RoundsAnswered | RoundsStopped<T>

/** The tool rounds of ONE call, with what its attempts carry to each other. */
export interface CallRounds<T> {
  /** This rung converses: its client binds tools and its plugin does not refuse them. */
  tooled: (rung: ActiveRung) => boolean
  /**
   * Before an attempt on a rung that does not converse: the input to prepare afresh — the caller's,
   * a note of what earlier attempts looked up, the guidance — or `undefined` when nothing was looked
   * up and the call's usual request stands.
   */
  plain: (guidance: CallGuidance<T>) => ModelInput | undefined
  /** One attempt's conversation, up to its answer or a stop. Its look rounds are carried to the next attempt. */
  converse: (active: ActiveRung, attempt: number, guidance: CallGuidance<T>) => Promise<RoundsOutcome<T>>
  /** The latest attempt's conversation, closed by `answer` as the model gave it (ignored after a stop). */
  conversation: (answer?: string) => LlmToolConversation
}

export interface RoundsUtils {
  /** The tool rounds of one call; refuses, fatally, two tools of one name. */
  of: <T>(call: RoundsCall<T>) => CallRounds<T>
}
