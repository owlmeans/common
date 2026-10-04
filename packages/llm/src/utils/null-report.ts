import type { AIMessageChunk, MessageFieldWithRole } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { createIdOfLength } from '@owlmeans/basic-ids'
import type { LlmPurpose, NullCapture, NullKind } from '@owlmeans/llm-common'
import { logger } from '@owlmeans/log'
import type { LlmSpectator, ModelConfig } from '../types.js'

const log = logger('llm')

export interface NullReportParams {
  kind: NullKind
  action: string
  purpose?: LlmPurpose
  attempt: number
  startedAt: number
  /** The instance that actually ran — its `lc_kwargs` carry the effective request shape. */
  refined: BaseChatModel
  /** The ORIGINAL model config (refined instances do not reliably keep metadata). */
  config: Partial<ModelConfig>
  msgs: MessageFieldWithRole[]
  raw: AIMessageChunk | null
  schema?: { toolName: string; innerSchema: unknown }
  useCache: boolean
}

/**
 * Assemble a complete, replayable record of a model call that returned nothing usable:
 * the effective request, the raw response with its metadata, and the diagnostics that
 * distinguish the common causes (budget spent on hidden reasoning vs. a refused tool
 * call vs. an empty content array).
 */
export const buildNullReport = (p: NullReportParams): NullCapture => {
  // Read the request shape from lc_kwargs — the refined instance is rebuilt from those
  // and does not always preserve `metadata`.
  type Kwargs = {
    model?: string
    configuration?: { baseURL?: string }
    modelKwargs?: { reasoning?: unknown }
    topP?: number
  }
  const kwargs = p.refined.lc_kwargs as Kwargs
  const raw = p.raw
  const responseMeta = raw?.response_metadata as {
    finish_reason?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number }
  } | undefined
  const stopReason = (raw?.additional_kwargs as { stop_reason?: string } | undefined)?.stop_reason
  const usageMeta = raw?.usage_metadata as { input_tokens?: number; output_tokens?: number } | undefined
  const toolCalls = (raw as unknown as { tool_calls?: unknown[] } | null)?.tool_calls

  return {
    meta: {
      kind: p.kind,
      action: p.action,
      purpose: p.purpose,
      attempt: p.attempt,
      id: createIdOfLength(12),
      timestamp: Date.now(),
      elapsedMs: Date.now() - p.startedAt,
    },
    model: {
      // The provider-side model slug (needed for replay); falls back to the config alias.
      id: kwargs.model ?? p.config.model,
      provider: p.config.provider,
      baseUrl: kwargs.configuration?.baseURL,
      maxTokens: (p.refined as unknown as { maxTokens?: number }).maxTokens,
      reasoning: kwargs.modelKwargs?.reasoning,
      temperature: (p.refined as unknown as { temperature?: number }).temperature,
      topP: kwargs.topP,
    },
    request: {
      messages: p.msgs as unknown[],
      schema: p.schema,
      useCache: p.useCache,
    },
    response: raw != null ? {
      content: raw.content,
      additional_kwargs: raw.additional_kwargs,
      response_metadata: raw.response_metadata,
      usage_metadata: raw.usage_metadata,
      tool_calls: toolCalls,
    } : null,
    diagnostics: {
      // Two providers, two places. OpenAI-compatible APIs put it on `response_metadata`;
      // Anthropic never does — it arrives on the `message_delta` event and langchain spreads it
      // into `additional_kwargs.stop_reason`. Reading only the first printed `undefined` for
      // every Anthropic null, hiding the `max_tokens` that explains most of them.
      finishReason: responseMeta?.finish_reason ?? stopReason,
      /** No text block at all — the shape of a completion that was all reasoning. */
      thinkingOnly: Array.isArray(raw?.content) && raw.content.length > 0
        && !raw.content.some(part => (part as { type?: string }).type === 'text'),
      inputTokens: usageMeta?.input_tokens ?? responseMeta?.usage?.prompt_tokens,
      outputTokens: usageMeta?.output_tokens ?? responseMeta?.usage?.completion_tokens,
      reasoningTokens: responseMeta?.usage?.reasoning_tokens,
      contentEmpty: raw == null || raw.content === '' || raw.content == null
        || (Array.isArray(raw.content) && raw.content.length === 0),
      hadToolCall: Array.isArray(toolCalls) && toolCalls.length > 0,
    },
  }
}

/**
 * Log the diagnostics of a null result, and hand the full capture to the spectator
 * sink when the caller opted into capturing. A failing sink must never mask the model
 * error the caller is about to throw.
 */
export const reportNull = async (
  spectator: LlmSpectator,
  captureNull: boolean,
  p: NullReportParams,
): Promise<void> => {
  const capture = buildNullReport(p)
  log.warn('Model returned a null result', {
    kind: capture.meta.kind, action: capture.meta.action, attempt: capture.meta.attempt,
    model: capture.model.id, finishReason: capture.diagnostics.finishReason,
  })

  if (log.enabled('debug')) {
    // Sizes, never prompt or completion text: the full record goes to the capture sink alone.
    const content = capture.response?.content
    log.debug('Model null result details', {
      meta: capture.meta,
      // Renamed off `*Tokens`: the log redacts every key that looks like a credential.
      model: {
        id: capture.model.id, provider: capture.model.provider, outputLimit: capture.model.maxTokens,
        reasoning: capture.model.reasoning, temperature: capture.model.temperature,
      },
      diagnostics: {
        finishReason: capture.diagnostics.finishReason,
        thinkingOnly: capture.diagnostics.thinkingOnly,
        contentEmpty: capture.diagnostics.contentEmpty,
        hadToolCall: capture.diagnostics.hadToolCall,
        usage: {
          input: capture.diagnostics.inputTokens,
          output: capture.diagnostics.outputTokens,
          reasoning: capture.diagnostics.reasoningTokens,
        },
      },
      request: p.msgs.map(msg => ({
        role: (msg as { role?: string }).role ?? 'unknown',
        chars: typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content ?? '').length,
      })),
      response: capture.response != null ? {
        contentChars: typeof content === 'string' ? content.length : JSON.stringify(content ?? '').length,
        toolCalls: Array.isArray(capture.response.tool_calls) ? capture.response.tool_calls.length : 0,
      } : null,
    })
  }

  if (captureNull) {
    try {
      await spectator.captureNull?.(capture)
    } catch (e) {
      log.warn('Model null capture write failed', e)
    }
  }
}
