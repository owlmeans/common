import { Ajv } from 'ajv'
import type { JSONSchemaType } from 'ajv'
import { AIMessage, BaseMessage } from '@langchain/core/messages'
import type { AIMessageChunk, MessageContent, MessageFieldWithRole } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { StructuredMode } from '@owlmeans/llm-common'
import type { NullKind } from '@owlmeans/llm-common'
import {
  DEFAULT_MODEL_RETRIES, FALLBACK_AFTER_ATTEMPTS, MAX_CACHE_BREAKPOINTS,
} from './consts.js'
import { LlmModelError } from './errors.js'
import { pluginFor, pluginOf } from './plugins/index.js'
import type { LlmPlugin } from './plugins/types.js'
import { coerceToSchema, parseJsonContent } from './helpers/json.js'
import { normalizeInput } from './helpers/messages.js'
import { withRetry } from './helpers/retry.js'
import { spectate } from './helpers/spectate.js'
import { idleTimeout, readConfig, resolveOutputCap } from './utils/config.js'
import { reportNull } from './utils/null-report.js'
import type { NullReportParams } from './utils/null-report.js'
import { applyNoThink, dropBlankContent, ensureJsonMention, stripCacheMarkers } from './utils/prompt.js'
import { resolveSchemaValidator, toToolName, unwrapNamed } from './utils/schema.js'
import { streamWithDeadline } from './utils/stream.js'
import type {
  LlmAskOptions, LlmInvokeOptions, LlmModel, LlmModelOptions, LlmRequestOptions,
  LlmSpectator, LlmTalkOptions, ModelInput, RefferedResult,
} from './types.js'

type StreamOptions = Parameters<BaseChatModel['stream']>[1]

const isSystem = (msg: MessageFieldWithRole): boolean =>
  msg instanceof BaseMessage ? msg.getType() === 'system' : `${msg.role}` === 'system'

const textOf = (content: MessageContent | undefined): string => {
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        const text = (part as unknown as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      })
      .filter(text => text !== '')
      .join('\n\n')
      .trim()
  }
  return ''
}

/**
 * Detach the caller's LEADING system messages and return their text.
 *
 * They are re-emitted as the `Context` block of the composed prompt, which is what keeps
 * a caller that still builds its own `SystemMessage` working unchanged — the text simply
 * travels a different route and lands in the same place. Only the leading run is taken:
 * a system message deliberately placed mid-conversation is an operator instruction whose
 * position carries meaning, and moving it would change what the model sees.
 */
const takeLeadingSystem = (msgs: MessageFieldWithRole[]): string[] => {
  const carried: string[] = []
  while (msgs.length > 0 && isSystem(msgs[0])) {
    const [msg] = msgs.splice(0, 1)
    const text = textOf(msg.content)
    if (text !== '') {
      carried.push(text)
    }
  }

  return carried
}

/**
 * Build the four-method model API on top of a LangChain chat model.
 *
 * Everything provider-specific — how the client is refined between retries, how
 * structured output is requested, whether prompt caching exists — is delegated to the
 * `LlmPlugin` resolved for this model (see `plugins/`). The model itself only owns the
 * provider-independent parts: streaming under an idle deadline, retry/fallback
 * escalation, schema validation and coercion, spectator logging, and null diagnostics.
 */
export const makeLlmModel = ({
  model,
  outputErrors = false,
  captureNull = false,
  retries = DEFAULT_MODEL_RETRIES,
  purpose,
  prompt,
  prompts,
  files,
  utility,
}: LlmModelOptions, spectator: LlmSpectator): LlmModel => {

  const ajv = new Ajv({ strict: false })

  // The original config and its plugin are static per model instance: a REFINED instance
  // is rebuilt from `lc_kwargs` and does not reliably carry the metadata back.
  const config = readConfig(model)
  const plugin: LlmPlugin | undefined = pluginOf(config.provider) ?? pluginFor(model)
  const timeout = idleTimeout(config)

  /**
   * Where on the escalation ladder this call starts.
   *
   * The ladder has exactly `retries` rungs, so a seed past the last one buys nothing and
   * would only inflate the attempt number handed to `refine`. Clamped, `refineModel` sees
   * at most `2 * (retries - 1)` — the escalator's own doubling stays bounded by the
   * output cap either way.
   */
  const ladderSeed = (escalation?: number): number =>
    Math.max(0, Math.min(Math.floor(escalation ?? 0), retries - 1))

  /**
   * Normalize, compose the system prompt, then apply every in-place prompt adaptation, in
   * dependency order.
   *
   * With no prompt service wired this is exactly what it always was — the caller's
   * messages, a JSON nudge, `/no_think`, cache markers. With one, the caller's leading
   * system text is folded into a composed prompt whose stable sections come first, which
   * is the whole point: a prompt cache is a PREFIX match, so the bytes every call shares
   * have to be physically ahead of the bytes that differ.
   */
  const prepare = async (
    input: ModelInput,
    action: string,
    useCache: boolean,
    cacheMax: number,
    json: boolean,
    callSkills?: string[],
  ): Promise<MessageFieldWithRole[]> => {
    const msgs = normalizeInput(input)
    // The caller may hand back messages this pipeline marked on a PREVIOUS call — the
    // markers live on its own objects. The budget is per request, so clear them and
    // re-place our own below; otherwise they accumulate until the provider 400s.
    stripCacheMarkers(msgs)
    dropBlankContent(msgs)
    let reserved = 0

    if (prompts != null) {
      const carried = takeLeadingSystem(msgs)
      const composed = await prompts().compose(
        {
          ...prompt,
          context: [...(prompt?.context ?? []), ...carried],
          callSkills: callSkills ?? prompt?.callSkills,
        },
        msgs,
        { model, provider: plugin, purpose, action, cacheMax, files, utility },
      )
      if (composed.system != null) {
        msgs.unshift(composed.system)
        reserved = composed.breakpoints
      } else {
        // Defensive: nothing was contributed, so hand the caller's own text straight back.
        for (let i = carried.length - 1; i >= 0; i--) {
          msgs.unshift({ role: 'system', content: carried[i] })
        }
      }
    }

    if (json) ensureJsonMention(msgs)
    // The soft switch is for models with no request-level control; a plugin that sends the
    // real parameter must not also get the directive as prompt text.
    applyNoThink(msgs, config.disableThinking === true && plugin?.suppressesThinking?.(config) !== true)
    // Cache markers replace string content with content blocks, so they must go last.
    const ttl = prompt?.cacheTtl
    const marked = plugin?.patchCache?.(msgs, {
      model, useCache, cacheMax, reserved, ...(ttl != null ? { ttl } : {}),
    })
    if (reserved > 0 || marked === true) {
      console.log(
        `Prompt caching for ${plugin?.type}: ${reserved} system breakpoint(s)`
        + `${marked === true ? ', 1 message breakpoint' : ''}`
      )
    }

    return msgs
  }

  const notifyRef = <T>(ref: RefferedResult<T> | undefined, value: T): void => {
    if (ref != null) {
      ref.value = value
      void ref.callback?.(value).finally()
    }
  }

  /**
   * Record the diagnostics of a call that produced nothing usable and build the
   * retryable error describing it. The caller throws it, so control flow stays visible.
   */
  const nullResult = async (
    kind: NullKind,
    p: Omit<NullReportParams, 'kind' | 'purpose' | 'config'>,
    parsed: boolean = false,
  ): Promise<LlmModelError> => {
    await reportNull(spectator, captureNull, { ...p, kind, purpose, config })
    const toolCalls = (p.raw as unknown as { tool_calls?: unknown[] } | null)?.tool_calls?.length ?? 0
    const content = JSON.stringify(p.raw?.content ?? null).substring(0, 120)
    return new LlmModelError(
      `null-output:raw=${p.raw != null}, parsed=${parsed}, toolCalls=${toolCalls}, content=${content}`
    )
  }

  /**
   * Rebuild the model for attempt N.
   *
   * Two-layer fallback: once a cheap primary has failed {@link FALLBACK_AFTER_ATTEMPTS}
   * times, escalate to the stronger model the service attached as `__fallbackModel`. The
   * escalation only happens WITHIN one plugin family — rotating providers mid-call would
   * flip the structured-output call shape (tool_choice spelling, native support), so it is
   * better to keep retrying on the primary than to switch families.
   */
  const refineModel = (attempt: number, temperature?: number): BaseChatModel => {
    const fallbackModel = (model as unknown as { __fallbackModel?: BaseChatModel }).__fallbackModel
    const sameFamily = fallbackModel != null && plugin != null
      && plugin.owns(model) && plugin.owns(fallbackModel)
    const base = (sameFamily && attempt >= FALLBACK_AFTER_ATTEMPTS) ? fallbackModel : model

    if (attempt === FALLBACK_AFTER_ATTEMPTS && fallbackModel != null) {
      if (base !== model) {
        console.warn(`${base.getName()}: switching to fallback model after ${attempt} failed attempts`)
      } else {
        console.warn(
          `Skipping cross-family fallback (${fallbackModel.getName()}); staying on ${model.getName()}`
        )
      }
    }

    const baseConfig = readConfig(base)
    const basePlugin = pluginOf(baseConfig.provider) ?? pluginFor(base)
    if (basePlugin == null) return base

    // Read from the ACTIVE base — after the fallback swap that is the fallback's own
    // config, so the escalator sizes the model it is actually talking to.
    const maxOutputCap = resolveOutputCap(baseConfig)
    const refined = basePlugin.refine({ base, attempt, temperature, maxOutputCap })

    if (attempt > 0) {
      const maxTokens = (refined as unknown as { maxTokens?: number }).maxTokens
      console.warn(`${refined.getName()}: retry attempt ${attempt}, maxTokens now ${maxTokens}`)
    }

    return refined
  }

  /** How this model should be asked for schema-conforming output. */
  const structuredMode = (): StructuredMode => plugin != null
    ? plugin.structuredMode(config as Parameters<LlmPlugin['structuredMode']>[0])
    : (config.structuredOutput === true ? StructuredMode.Native : StructuredMode.Tool)

  /**
   * Shared structured-output core for `invoke`/`request`. Streams under the idle deadline
   * (whose break-on-`finish_reason` also dedups the duplicate final chunk some providers
   * emit, which would otherwise corrupt accumulated tool-call arguments), accumulates the
   * chunks and extracts the parsed object.
   *
   * `withStructuredOutput` is deliberately NOT used: it buffers the whole raw stream
   * before yielding, which is too late to dedup.
   */
  const streamStructured = async <T>(
    refined: BaseChatModel,
    msgs: MessageFieldWithRole[],
    innerSchema: JSONSchemaType<T>,
    toolName: string,
    action: string,
  ): Promise<{ piece: AIMessageChunk | null; result: T | null; mode: StructuredMode }> => {
    const responseFormat = structuredMode() === StructuredMode.Native
      ? plugin?.responseFormat?.(toolName, innerSchema)
      : undefined
    // A plugin that declares Native but provides no response_format falls back to tools.
    const mode = responseFormat != null ? StructuredMode.Native : StructuredMode.Tool

    const start = (signal: AbortSignal): Promise<AsyncIterable<unknown>> => {
      const base = { runName: action, metadata: { purpose }, signal }
      if (mode === StructuredMode.Native) {
        return refined.stream(msgs, { ...base, ...responseFormat && { response_format: responseFormat } } as unknown as StreamOptions)
      }
      // langchain converts the OpenAI-shaped tool DEFINITION for either provider, but the
      // `tool_choice` shape is NOT converted — the plugin supplies the right spelling.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const bound = refined.bindTools!(
        [{ type: 'function', function: { name: toolName, description: '', parameters: innerSchema } }],
        { tool_choice: plugin?.toolChoice(toolName) ?? { type: 'function', function: { name: toolName } } }
      )
      return bound.stream(msgs, base)
    }

    let piece: AIMessageChunk | null = null
    for await (const rawChunk of streamWithDeadline(start, timeout)) {
      const chunk = rawChunk as AIMessageChunk
      piece = piece == null ? chunk : (piece.concat(chunk) as AIMessageChunk)
    }

    let result: T | null = null
    if (mode === StructuredMode.Tool) {
      const rawArgs = piece?.tool_calls?.[0]?.args ?? null
      result = rawArgs != null
        ? (typeof rawArgs === 'string' ? parseJsonContent(rawArgs) as T | null : rawArgs as T)
        : null
    }
    // Content fallback: some models ignore the pinned tool (or the JSON mode) and emit the
    // schema-shaped JSON as plain content.
    if (result == null && piece != null) {
      const recovered = parseJsonContent(piece.content)
      if (recovered != null) result = recovered as T
    }

    return { piece, result, mode }
  }

  const helper: LlmModel = {
    ask: async (
      input,
      {
        ref, filter, action, useCache = false, cacheMax = MAX_CACHE_BREAKPOINTS, skills,
        escalation, fatal,
      }: LlmAskOptions
    ) => {
      const msgs = await prepare(input, action, useCache, cacheMax, false, skills)
      const seed = ladderSeed(escalation)
      return withRetry({ retries, outputErrors, fatal }, async i => {
        const refined = refineModel(seed + i)
        console.log('Use model to ask: ', refined.getName(), refined.lc_kwargs.model)
        const startedAt = Date.now()
        let result: AIMessageChunk | null = null
        for await (const chunk of streamWithDeadline(
          signal => refined.stream(msgs, { runName: action, metadata: { purpose }, signal }), timeout
        )) {
          result = result == null ? chunk : result.concat(chunk)
        }
        if (result == null) {
          throw await nullResult('ask', { action, attempt: i, startedAt, refined, msgs, raw: result, useCache })
        }

        const message = new AIMessage(result)
        let output: string = typeof result.content === 'string'
          ? result.content
          : Array.isArray(result.content)
            ? result.content
              .filter((c): c is { type: string; text: string } =>
                typeof c === 'object' && c !== null && 'type' in c && c.type === 'text'
              )
              .map(c => c.text)
              .join('')
            : ''

        // A completion can carry text in blocks this strict filter does not name — the tolerant
        // extractor reads any block with a string `text`. Only consulted once the strict pass
        // found nothing, so the usual path keeps its exact spacing.
        if (output.trim() === '') {
          output = textOf(result.content)
        }

        const entry = await spectate(spectator, 'ask')(msgs, message, action, i, startedAt)
        if (ref != null) ref.spectatorEntry = entry

        // An empty completion is a NULL RESULT, and it is diagnosed here rather than blamed on
        // the caller. Both shipped filters return null only for empty input, so letting one run
        // first reported every empty answer as `filter-rejected` — naming the innocent party and,
        // worse, skipping `reportNull`, whose stop reason and output-token count are the only
        // things that say WHY nothing came back (a model that spent its whole budget thinking).
        if (output.trim() === '') {
          throw await nullResult('ask', {
            action, attempt: i, startedAt, refined, msgs, raw: result, useCache,
          })
        }

        if (filter != null) {
          const produced = output
          const filtered = await filter(produced, message)
          if (filtered == null) {
            // The OUTPUT, not the message envelope: `JSON.stringify(new AIMessage(...))` is 80
            // constant characters of LangChain serialization stub and says nothing at all.
            throw new LlmModelError(`filter-rejected:${produced.substring(0, 200)}`)
          }
          output = filtered
        }

        notifyRef(ref, message)
        return output
      })
    },

    talk: async (
      input,
      {
        ref, filter, action, useCache = false, cacheMax = MAX_CACHE_BREAKPOINTS, skills,
        escalation, fatal,
      }: LlmTalkOptions
    ) => {
      const msgs = await prepare(input, action, useCache, cacheMax, false, skills)
      const seed = ladderSeed(escalation)
      return withRetry({ retries, outputErrors, fatal }, async i => {
        const refined = refineModel(seed + i)
        console.log('Use model to talk: ', refined.getName(), refined.lc_kwargs.model)
        const startedAt = Date.now()
        let result: AIMessageChunk | null = null
        for await (const chunk of streamWithDeadline(
          signal => refined.stream(msgs, { runName: action, metadata: { purpose }, signal }), timeout
        )) {
          result = result == null ? chunk : result.concat(chunk)
        }
        if (result == null) {
          throw await nullResult('talk', { action, attempt: i, startedAt, refined, msgs, raw: result, useCache })
        }

        let message: AIMessage | null = new AIMessage(result)
        const entry = await spectate(spectator, 'talk')(msgs, message, action, i, startedAt)
        if (ref != null) ref.spectatorEntry = entry

        if (filter != null) {
          message = await filter(message)
          if (message == null) {
            throw new LlmModelError('filter-rejected:talk')
          }
        }

        notifyRef(ref, message)
        return message
      })
    },

    invoke: async <T>(
      input: ModelInput,
      schema: JSONSchemaType<T>,
      {
        temperature, ref, filter, action, useCache = false, cacheMax = MAX_CACHE_BREAKPOINTS,
        skills, escalation, fatal,
      }: LlmInvokeOptions<T>
    ) => {
      const msgs = await prepare(input, action, useCache, cacheMax, true, skills)
      const { name, innerSchema, validate } = resolveSchemaValidator<T>(ajv, schema)
      const toolName = toToolName((innerSchema as { title?: string }).title ?? name)

      const seed = ladderSeed(escalation)
      return withRetry({ retries, outputErrors, fatal }, async i => {
        const refined = refineModel(seed + i, temperature)
        console.log('Use model invoke: ', refined.getName(), refined.lc_kwargs.model)
        const startedAt = Date.now()
        const { piece, result: collected } = await streamStructured(refined, msgs, innerSchema, toolName, action)
        let result: T | null = collected
        if (piece == null || result == null) {
          throw await nullResult('invoke', {
            action, attempt: i, startedAt, refined, msgs, raw: piece,
            schema: { toolName, innerSchema }, useCache,
          }, result != null)
        }

        const message = new AIMessage(piece)
        const entry = await spectate(spectator, 'invoke')(msgs, message, action, i, startedAt)
        if (ref != null) ref.spectatorEntry = entry

        result = unwrapNamed(result, name)
        result = coerceToSchema(result, innerSchema) as T

        if (filter != null) {
          const preFilter = result
          result = await filter(result, message)
          if (result == null) {
            throw new LlmModelError(`filter-rejected:${JSON.stringify(preFilter).substring(0, 200)}`)
          }
        }

        if (!validate(result)) {
          const err = new LlmModelError(`validation-failed:${JSON.stringify(validate.errors)}`)
          err.cause = validate.errors?.[0]
          throw err
        }

        notifyRef(ref, message)
        return result as T
      })
    },

    request: async <T>(
      input: ModelInput,
      schema: JSONSchemaType<T>,
      {
        ref, filter, action, useCache = false, cacheMax = MAX_CACHE_BREAKPOINTS, skills,
        escalation, fatal,
      }: LlmRequestOptions
    ) => {
      const msgs = await prepare(input, action, useCache, cacheMax, true, skills)
      const { name, innerSchema, validate } = resolveSchemaValidator<T>(ajv, schema)
      const toolName = toToolName((innerSchema as { title?: string }).title ?? name)

      const seed = ladderSeed(escalation)
      return withRetry({ retries, outputErrors, fatal }, async i => {
        const refined = refineModel(seed + i)
        console.log('Use model request: ', refined.getName(), refined.lc_kwargs.model)
        const startedAt = Date.now()
        const { piece, result: collected } = await streamStructured(refined, msgs, innerSchema, toolName, action)
        let result: T | null = collected
        if (piece == null || result == null) {
          throw await nullResult('request', {
            action, attempt: i, startedAt, refined, msgs, raw: piece,
            schema: { toolName, innerSchema }, useCache,
          }, result != null)
        }

        let message: AIMessage | null = new AIMessage(piece)
        const entry = await spectate(spectator, 'request')(msgs, message, action, i, startedAt)
        if (ref != null) ref.spectatorEntry = entry

        // Structured output delivers the JSON as parsed tool arguments, not as message
        // content. Surface it on `.content` so the AIMessage contract callers rely on holds.
        result = unwrapNamed(result, name)
        result = coerceToSchema(result, innerSchema) as T
        message.content = JSON.stringify(result)

        if (filter != null) {
          message = await filter(message)
          if (message == null) {
            throw new LlmModelError('filter-rejected:request')
          }
        } else if (message.content == null || message.content.toString().trim() === '') {
          throw new LlmModelError(`empty-content:${JSON.stringify(message).substring(0, 50)}...`)
        }

        if (!validate(JSON.parse(`${message.content}`))) {
          const err = new LlmModelError(`validation-failed:${JSON.stringify(validate.errors)}`)
          err.cause = validate.errors?.[0]
          throw err
        }

        notifyRef(ref, message)
        return message
      })
    },
  }

  return helper
}
