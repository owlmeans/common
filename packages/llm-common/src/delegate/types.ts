/**
 * The serializable form of one model call, for a performer outside this process.
 *
 * A delegated call cannot pass a `BaseChatModel` or a langchain message anywhere: the thing that
 * answers it is a coding agent on somebody's laptop, a test double, or a person. So the call is
 * reduced to what any of them can act on — a persona, a conversation, and the shape the answer
 * must take — and everything provider-specific is left behind.
 *
 * There is no vocabulary here from whatever pipeline asked. A `role` and a `tier` travel because
 * the performer has to choose a model; nothing else about the caller does.
 */

/** What the answer must be. */
export enum DelegatedMode {
  /** Prose or code. */
  Text = 'text',
  /** Exactly one JSON object satisfying `outputSchema`. */
  Json = 'json',
  /** A list of calls chosen from `tools`. */
  Tools = 'tools',
}

/** Who a message came from. Deliberately the four roles every chat API agrees on. */
export enum DelegatedRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
}

/** What shape an answer came back in. */
export enum DelegatedResultKind {
  Text = 'text',
  Json = 'json',
  ToolCalls = 'tool-calls',
  /** The performer could not answer. Treated as a malformed answer: asked again, with the reason. */
  Error = 'error',
}

export interface DelegatedToolCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

export interface DelegatedMessage {
  role: DelegatedRole
  content: string
  /** Assistant turns that called tools. */
  toolCalls?: DelegatedToolCall[]
  /** Tool turns answer one call, and name the tool they answer. */
  toolCallId?: string
  name?: string
}

export interface DelegatedTool {
  name: string
  description?: string
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>
}

export type DelegatedToolChoice = 'auto' | 'none' | { name: string }

export interface DelegatedTask {
  id: string
  /** Which transport is expected to answer it — the key the application seated it under. */
  delegate: string
  /** The performer's role name, for its own logging. Never load-bearing. */
  role?: string
  /** Which power class the performer should run this on. */
  tier?: string
  /** 0-based. Above zero means a previous answer was refused; `feedback` says why. */
  attempt: number
  mode: DelegatedMode
  system?: string
  messages: DelegatedMessage[]
  tools?: DelegatedTool[]
  toolChoice?: DelegatedToolChoice
  outputSchema?: Record<string, unknown>
  /** A soft cap, stated so a performer can size its own call. */
  maxOutputChars?: number
  feedback?: string
  /** ISO. A performer past this may say so rather than answer. */
  expiresAt?: string
}

export interface DelegatedUsage {
  inputTokens?: number
  outputTokens?: number
}

export interface DelegatedResult {
  taskId: string
  kind: DelegatedResultKind
  text?: string
  json?: unknown
  toolCalls?: DelegatedToolCall[]
  error?: string
  /** What the performer spent. Recorded; it costs this deployment nothing. */
  usage?: DelegatedUsage
  /** What the performer actually ran. Display only. */
  model?: string
}

/**
 * How a delegated call reaches its performer.
 *
 * One method, because that is the whole seam: everything about routing, waiting, redelivery and
 * giving up belongs to whoever implements it. A transport that cannot serve the call must THROW
 * rather than answer with an error result — an error result is a bad answer, which is retried,
 * while a transport that is gone is terminal.
 */
export interface DelegateTransport {
  dispatch: (task: DelegatedTask, signal?: AbortSignal) => Promise<DelegatedResult>
}
