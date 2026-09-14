import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseChatModelCallOptions, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import type { ChatGeneration, ChatResult } from '@langchain/core/outputs'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import type { BindToolsInput } from '@langchain/core/language_models/chat_models'
import { DelegatedMode, DelegatedResultKind, DelegatedRole } from '@owlmeans/llm-common'
import type {
  DelegatedMessage, DelegatedResult, DelegatedTask, DelegatedTool, DelegatedToolChoice
} from '@owlmeans/llm-common'
import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import { DELEGATED_LLM_TYPE, DELEGATED_MODEL_PREFIX } from './consts.js'
import { transportFor } from './transport.js'

export interface DelegatedCallOptions extends BaseChatModelCallOptions {
  /** OpenAI-shaped tool definitions, as `bindTools` was given them. */
  tools?: BindToolsInput[]
  response_format?: unknown
}

export interface DelegatedChatModelParams extends BaseChatModelParams {
  /** Which seated transport answers. */
  delegate: string
  /** The power class the performer should use. */
  tier?: string
  /** The performer's own name for what asked. */
  role?: string
  maxOutputChars?: number
  /** Retry attempt, carried so the performer knows a previous answer was refused. */
  attempt?: number
  feedback?: string
  /**
   * What this model is called.
   *
   * Accepted under both names because the two readers spell it differently: the spectator reads
   * `modelName` off the instance, while the runtime's call log and its null-result report read
   * `lc_kwargs.model` — the field name every provider client is constructed with. Neither has to
   * be supplied: with no name at all the model is `delegated:<tier>`.
   */
  model?: string
  /** The same value under the name a spectator reads off the instance. */
  modelName?: string
}

/**
 * Turn a langchain message into the portable form a performer outside this process can read.
 *
 * Content is flattened to text on purpose. A performer is a coding agent or a person; multi-part
 * content, provider cache markers and image blocks mean nothing to either, and a shape they cannot
 * read is a shape they will silently drop.
 */
const toDelegated = (message: BaseMessage): DelegatedMessage => {
  const type = message.getType()
  const role = type === 'system'
    ? DelegatedRole.System
    : type === 'ai'
      ? DelegatedRole.Assistant
      : type === 'tool'
        ? DelegatedRole.Tool
        : DelegatedRole.User

  const content = typeof message.content === 'string'
    ? message.content
    : message.content
      .map(part => (part as { type?: string, text?: string }).text ?? '')
      .filter(text => text !== '')
      .join('\n')

  const calls = (message as { tool_calls?: Array<{ id?: string, name: string, args: Record<string, unknown> }> })
    .tool_calls

  return {
    role,
    content,
    ...(calls != null && calls.length > 0
      ? { toolCalls: calls.map(call => ({ id: call.id, name: call.name, args: call.args })) }
      : {}),
    ...(type === 'tool'
      ? {
        toolCallId: (message as { tool_call_id?: string }).tool_call_id,
        name: (message as { name?: string }).name,
      }
      : {}),
  }
}

/** Unwrap the OpenAI-shaped definitions `bindTools` receives into name + schema. */
const toTools = (tools: BindToolsInput[] | undefined): DelegatedTool[] | undefined => {
  if (tools == null || tools.length < 1) return undefined

  return tools.map(tool => {
    const fn = (tool as { function?: { name: string, description?: string, parameters?: unknown } }).function
    if (fn != null) {
      return {
        name: fn.name,
        description: fn.description,
        parameters: (fn.parameters ?? {}) as Record<string, unknown>,
      }
    }
    const plain = tool as { name: string, description?: string, schema?: unknown, parameters?: unknown }

    return {
      name: plain.name,
      description: plain.description,
      parameters: (plain.parameters ?? plain.schema ?? {}) as Record<string, unknown>,
    }
  })
}

/**
 * Reduce every provider's `tool_choice` spelling to the one thing a performer needs to know.
 *
 * The plugins each produce their own shape — Anthropic's `{type:'tool', name}`, OpenAI's
 * `{type:'function', function:{name}}` — because a provider rejects the other. A performer has no
 * provider, so it gets the name or nothing.
 */
const toToolChoice = (choice: unknown): DelegatedToolChoice | undefined => {
  if (choice == null) return undefined
  if (choice === 'auto' || choice === 'none') return choice
  const shaped = choice as { name?: string, function?: { name?: string } }
  const name = shaped.name ?? shaped.function?.name

  return name != null ? { name } : undefined
}

/**
 * A chat model whose calls are performed by somebody else.
 *
 * It answers the same `BaseChatModel` contract every provider client does, so the model runtime
 * above it — streaming discipline, retries, structured-output coercion, the spectator — works
 * unchanged. What it does instead of a request is package the call and hand it to a transport.
 *
 * One chunk comes back rather than a stream, because the performer answers once. That is why a
 * delegated config must declare a long `streamTimeout`: the runtime's idle deadline measures
 * silence between tokens, and there is exactly one silence here — the whole call.
 */
export class DelegatedChatModel extends BaseChatModel<DelegatedCallOptions> {
  delegate: string
  tier?: string
  role?: string
  maxOutputChars?: number
  attempt: number
  feedback?: string
  modelName: string

  constructor(fields: DelegatedChatModelParams) {
    super(fields)
    this.delegate = fields.delegate
    this.tier = fields.tier
    this.role = fields.role
    this.maxOutputChars = fields.maxOutputChars
    this.attempt = fields.attempt ?? 0
    this.feedback = fields.feedback
    this.modelName = fields.model
      ?? fields.modelName
      ?? `${DELEGATED_MODEL_PREFIX}${fields.tier ?? 'standard'}`
    // The runtime identifies a model by `lc_kwargs.model` — every call it logs, and the model
    // section of a null-result report. `lc_kwargs` is the constructor's own fields, so a model
    // built without that key was reported as `DelegatedChatModel undefined`: a call performed
    // outside this process, with nothing in the log saying which one. Written here rather than
    // left to the caller, because the name is DERIVED where none was given and a model has to be
    // identifiable however it was built.
    this.lc_kwargs = { ...this.lc_kwargs, model: this.modelName }
  }

  _llmType(): string {
    return DELEGATED_LLM_TYPE
  }

  override bindTools(tools: BindToolsInput[], kwargs?: Partial<DelegatedCallOptions>): any {
    return this.withConfig({ tools, ...kwargs } as Partial<DelegatedCallOptions>)
  }

  /**
   * Rebuild for a retry.
   *
   * The same transport and the same performer: a delegated call has no fallback endpoint to move
   * to, and switching performers mid-run would bill somebody else for half the work. What changes
   * is the attempt number and the feedback, which is what lets a performer see that its previous
   * answer was refused and why.
   */
  withAttempt(attempt: number, feedback?: string): DelegatedChatModel {
    return new DelegatedChatModel({
      delegate: this.delegate,
      tier: this.tier,
      role: this.role,
      maxOutputChars: this.maxOutputChars,
      // The name travels with the retry: a rebuilt instance is what the next call logs.
      model: this.modelName,
      attempt,
      feedback: feedback ?? this.feedback,
      callbacks: this.callbacks,
      metadata: this.metadata,
    })
  }

  /**
   * The non-streaming form, folded from the streaming one.
   *
   * There is only ever one chunk, so this is the same call read differently — but langchain
   * requires it, and a caller that asks for a completion rather than a stream must not get an
   * abstract-method error for a model that can perfectly well answer.
   */
  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const generations: ChatGeneration[] = []
    for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
      generations.push({ text: chunk.text, message: chunk.message })
    }

    return { generations }
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const system = messages.length > 0 && messages[0].getType() === 'system'
      ? toDelegated(messages[0]).content
      : undefined
    const rest = system != null ? messages.slice(1) : messages

    const tools = toTools(options.tools)
    // Read as `unknown`: each provider plugin produces its own spelling, and the base call
    // options type only knows langchain's. Normalizing is exactly what `toToolChoice` is for.
    const toolChoice = toToolChoice((options as { tool_choice?: unknown }).tool_choice)
    // The mode is what the answer is CHECKED against, so it follows what was actually asked: a
    // pinned single tool is how this stack asks for structured output, and a performer told
    // "answer with one JSON object" produces something a person can also read.
    const pinned = typeof toolChoice === 'object' && toolChoice != null ? toolChoice.name : undefined
    const mode = tools == null
      ? DelegatedMode.Text
      : pinned != null ? DelegatedMode.Json : DelegatedMode.Tools

    const task: DelegatedTask = {
      id: createIdOfLength(16, IdStyle.Base58),
      delegate: this.delegate,
      role: this.role,
      tier: this.tier,
      attempt: this.attempt,
      mode,
      ...(system != null ? { system } : {}),
      messages: rest.map(toDelegated),
      ...(tools != null ? { tools } : {}),
      ...(toolChoice != null ? { toolChoice } : {}),
      ...(pinned != null
        ? { outputSchema: tools?.find(tool => tool.name === pinned)?.parameters }
        : {}),
      ...(this.maxOutputChars != null ? { maxOutputChars: this.maxOutputChars } : {}),
      ...(this.feedback != null ? { feedback: this.feedback } : {}),
    }

    const result = await transportFor(this.delegate).dispatch(task, options.signal)

    yield chunkOf(result, pinned, this.modelName, runManager)
  }
}

/**
 * Turn a performer's answer into the one completion chunk the runtime consumes.
 *
 * A `Json` answer becomes a TOOL CALL rather than text, because that is what the runtime asked
 * for: `invoke`/`request` pin one tool and read the arguments off the call. An answer that says
 * nothing at all is left empty on purpose — the runtime's own null-result reporting is what turns
 * that into a diagnosis, and a stand-in value here would hide it.
 */
const chunkOf = (
  result: DelegatedResult, pinned: string | undefined, modelName: string,
  runManager?: CallbackManagerForLLMRun
): ChatGenerationChunk => {
  const usage = result.usage
  const text = result.kind === DelegatedResultKind.Text ? result.text ?? '' : ''

  let toolCalls = result.toolCalls
  if (result.kind === DelegatedResultKind.Json && pinned != null && result.json != null) {
    toolCalls = [{ name: pinned, args: result.json as Record<string, unknown> }]
  }

  if (text !== '') {
    void runManager?.handleLLMNewToken(text)
  }

  const message = new AIMessageChunk({
    content: text,
    ...(toolCalls != null && toolCalls.length > 0
      ? {
        tool_calls: toolCalls.map(call => ({
          id: call.id ?? createIdOfLength(8, IdStyle.Base58),
          name: call.name,
          args: call.args,
          type: 'tool_call' as const,
        })),
        // `concat` on a chunk merges the CHUNK form; without it a single-chunk stream loses the
        // calls the moment anything tries to accumulate it.
        tool_call_chunks: toolCalls.map((call, index) => ({
          id: call.id ?? createIdOfLength(8, IdStyle.Base58),
          name: call.name,
          args: JSON.stringify(call.args),
          index,
          type: 'tool_call_chunk' as const,
        })),
      }
      : {}),
    ...(usage != null
      ? {
        usage_metadata: {
          input_tokens: usage.inputTokens ?? 0,
          output_tokens: usage.outputTokens ?? 0,
          total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        },
      }
      : {}),
    response_metadata: {
      finish_reason: result.kind === DelegatedResultKind.Error ? 'error' : 'stop',
      model_name: result.model ?? modelName,
      ...(result.error != null ? { delegated_error: result.error } : {}),
    },
  })

  return new ChatGenerationChunk({ text, message })
}
