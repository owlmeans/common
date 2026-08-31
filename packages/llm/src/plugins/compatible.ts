import { ChatOpenAI } from '@langchain/openai'
import { ModelProvider, StructuredMode } from '@owlmeans/llm-common'
import type { LlmPlugin } from './types.js'
import type { ModelConfig } from '../types.js'
import { makeConfiguration } from './utils.js'
import { openAiFamily } from './openai.js'

/** Aggregators that encode the serving provider as a `model:provider` suffix. */
const HUGGINGFACE_MARKER = 'huggingface'

/**
 * Any OpenAI-compatible endpoint that is not OpenAI itself — OpenRouter, the
 * HuggingFace router, Together, a self-hosted vLLM, …
 *
 * Differences from the proprietary `openai` plugin:
 * - Structured output defaults to the forced-tool-call hack. Native `response_format`
 *   support is inconsistent across the long tail of servers behind these endpoints, and
 *   a server that silently ignores it returns prose instead of JSON.
 * - `modelKwargs` forwards aggregator-specific top-level request fields verbatim:
 *   `reasoning` (hard-caps/disables thinking per the config) and
 *   `provider.require_parameters`, which tells the aggregator to exclude servers that do
 *   not honour every parameter in the request — without it a request can be routed to a
 *   server that ignores `tool_choice` and answers `finish_reason='stop'` with no tool
 *   call, or that sends the final SSE chunk twice.
 */
export const compatiblePlugin: LlmPlugin = {
  ...openAiFamily,

  type: ModelProvider.Compatible,

  structuredMode: (config: ModelConfig): StructuredMode =>
    config.structuredOutput === true ? StructuredMode.Native : StructuredMode.Tool,

  build: ({ config, secret, callbacks }) => {
    const baseModel = config.model ??= 'Qwen/Qwen3-235B-A22B-Instruct-2507'
    const baseURL = config.baseUrl
    const isHuggingFace = baseURL != null && baseURL.includes(HUGGINGFACE_MARKER)
    const model = config.inferenceProvider != null && isHuggingFace
      ? `${baseModel}:${config.inferenceProvider}`
      : baseModel
    const headers: Record<string, string> = {
      ...(isHuggingFace && config.organization != null ? { 'X-HF-Bill-To': config.organization } : {}),
      ...config.headers,
    }

    return new ChatOpenAI({
      model,
      apiKey: secret,
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens ?? 4096,
      topP: config.topP ?? 0.8,
      maxRetries: 5,
      metadata: { config },
      callbacks,
      modelKwargs: {
        ...(config.reasoning != null ? { reasoning: config.reasoning } : {}),
        provider: { require_parameters: true },
      },
      ...makeConfiguration({ baseURL, headers }),
    })
  },
}
