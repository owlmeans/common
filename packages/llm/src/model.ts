import { Ajv } from 'ajv'
import type { JSONSchemaType } from 'ajv'
import { AIMessage } from '@langchain/core/messages'
import type { AIMessageChunk, MessageFieldWithRole } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { StructuredMode } from '@owlmeans/llm-common'
import type { NullKind } from '@owlmeans/llm-common'
import {
  DEFAULT_MAX_OUTPUT_CAP, DEFAULT_MODEL_RETRIES, FALLBACK_AFTER_ATTEMPTS,
} from './consts.js'
import { LlmModelError } from './errors.js'
import { pluginFor, pluginOf } from './plugins/index.js'
import type { LlmPlugin } from './plugins/types.js'
import { coerceToSchema, parseJsonContent } from './helpers/json.js'
import { normalizeInput } from './helpers/messages.js'
import { withRetry } from './helpers/retry.js'
import { spectate } from './helpers/spectate.js'
import { idleTimeout, readConfig } from './utils/config.js'
import { reportNull } from './utils/null-report.js'
import type { NullReportParams } from './utils/null-report.js'
import { applyNoThink, ensureJsonMention } from './utils/prompt.js'
import { resolveSchemaValidator, toToolName, unwrapNamed } from './utils/schema.js'
import { streamWithDeadline } from './utils/stream.js'
import type {
  LlmAskOptions, LlmInvokeOptions, LlmModel, LlmModelOptions, LlmRequestOptions,
  LlmSpectator, LlmTalkOptions, ModelInput, RefferedResult,
} from './types.js'

type StreamOptions = Parameters<BaseChatModel['stream']>[1]

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
}: LlmModelOptions, spectator: LlmSpectator): LlmModel => {

  const ajv = new Ajv({ strict: false })

  // The original config and its plugin are static per model instance: a REFINED instance
  // is rebuilt from `lc_kwargs` and does not reliably carry the metadata back.
  const config = readConfig(model)
  const plugin: LlmPlugin | undefined = pluginOf(config.provider) ?? pluginFor(model)
  const timeout = idleTimeout(config)

  /** Normalize, then apply every in-place prompt adaptation, in dependency order. */
  const prepare = (input: ModelInput, useCache: boolean, cacheMax: number, json: boolean): MessageFieldWithRole[] => {
    const msgs = normalizeInput(input)
    if (json) ensureJsonMention(msgs)
    applyNoThink(msgs, config.disableThinking)
    // Cache markers replace string content with content blocks, so they must go last.
    if (plugin?.patchCache?.(msgs, { model, useCache, cacheMax }) === true) {
      console.log(`Prompt caching enabled for ${plugin.type} (up to ${cacheMax} breakpoints)`)
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

    const maxOutputCap = typeof baseConfig.maxTokensCap === 'number' && baseConfig.maxTokensCap > 0
      ? baseConfig.maxTokensCap
      : DEFAULT_MAX_OUTPUT_CAP
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
    ask: async (input, { ref, filter, action, useCache = false, cacheMax = 4 }: LlmAskOptions) => {
      const msgs = prepare(input, useCache, cacheMax, false)
      return withRetry({ retries, outputErrors }, async i => {
        const refined = refineModel(i)
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
        let output: string | null = typeof result.content === 'string'
          ? result.content
          : Array.isArray(result.content)
            ? result.content
              .filter((c): c is { type: string; text: string } =>
                typeof c === 'object' && c !== null && 'type' in c && c.type === 'text'
              )
              .map(c => c.text)
              .join('') || null
            : null

        const entry = await spectate(spectator, 'ask')(msgs, message, action, i, startedAt)
        if (ref != null) ref.spectatorEntry = entry

        if (filter != null) {
          output = await filter(output ?? '', message)
          if (output == null) {
            throw new LlmModelError(`filter-rejected:${JSON.stringify(message).substring(0, 50)}...`)
          }
        } else if (output == null || output.trim() === '') {
          throw new LlmModelError(`empty-content:${JSON.stringify(message).substring(0, 50)}...`)
        }

        notifyRef(ref, message)
        return output
      })
    },

    talk: async (input, { ref, filter, action, useCache = false, cacheMax = 4 }: LlmTalkOptions) => {
      const msgs = prepare(input, useCache, cacheMax, false)
      return withRetry({ retries, outputErrors }, async i => {
        const refined = refineModel(i)
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
      { temperature, ref, filter, action, useCache = false, cacheMax = 4 }: LlmInvokeOptions<T>
    ) => {
      const msgs = prepare(input, useCache, cacheMax, true)
      const { name, innerSchema, validate } = resolveSchemaValidator<T>(ajv, schema)
      const toolName = toToolName((innerSchema as { title?: string }).title ?? name)

      return withRetry({ retries, outputErrors }, async i => {
        const refined = refineModel(i, temperature)
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
      { ref, filter, action, useCache = false, cacheMax = 4 }: LlmRequestOptions
    ) => {
      const msgs = prepare(input, useCache, cacheMax, true)
      const { name, innerSchema, validate } = resolveSchemaValidator<T>(ajv, schema)
      const toolName = toToolName((innerSchema as { title?: string }).title ?? name)

      return withRetry({ retries, outputErrors }, async i => {
        const refined = refineModel(i)
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
