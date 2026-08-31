import util from 'util'
import type { AIMessageChunk, MessageFieldWithRole } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { createIdOfLength } from '@owlmeans/basic-ids'
import type { LlmPurpose, NullCapture, NullKind } from '@owlmeans/llm-common'
import type { LlmSpectator, ModelConfig } from '../types.js'

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

/** How many characters of each prompt message the console preview keeps. */
const PREVIEW_CHARS = 300

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
      finishReason: responseMeta?.finish_reason,
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
 * Print the diagnostics of a null result, and hand the full capture to the spectator
 * sink when the caller opted into capturing. A failing sink must never mask the model
 * error the caller is about to throw.
 */
export const reportNull = async (
  spectator: LlmSpectator,
  captureNull: boolean,
  p: NullReportParams,
): Promise<void> => {
  const capture = buildNullReport(p)
  const requestPreview = p.msgs.map(msg => {
    const text = typeof msg.content === 'string' ? msg.content.substring(0, PREVIEW_CHARS) : '[complex content]'
    return `[${(msg as { role?: string }).role ?? 'unknown'}] ${text}`
  }).join('\n---\n')

  console.error('[MODEL-NULL]', util.inspect(
    {
      meta: capture.meta, model: capture.model, diagnostics: capture.diagnostics,
      response: capture.response, requestPreview,
    },
    { depth: null, maxStringLength: 2000, breakLength: 120 }
  ))

  if (captureNull) {
    try {
      await spectator.captureNull?.(capture)
    } catch (e) {
      console.warn('[MODEL-NULL] capture write failed', e)
    }
  }
}
