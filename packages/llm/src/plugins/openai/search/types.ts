import type { ModelEffort } from '@owlmeans/llm-common'
import type { LlmSearchOutput, LlmSearchParams, WebSearchOptions } from '../../../search/types.js'

/** Where and how a Responses-API search is sent. */
export interface ResponsesSearchEndpoint {
  /** The `/responses` URL. */
  url: string
  provider: string
  /** `reasoning.effort` from the plugin's effort table; omitted when the model takes none. */
  effort?: ModelEffort
  /** Extra headers the endpoint needs beyond the bearer key (an organization). */
  headers?: Record<string, string>
}

/** Where and how a Chat-Completions search is sent. */
export interface ChatSearchEndpoint {
  /** The `/chat/completions` URL. */
  url: string
  provider: string
  dialect: string
  /** The fields that turn search on — `web_search_options`, or a server tool. */
  body: Record<string, unknown>
  /** The output-budget field this endpoint reads. */
  tokenParam: 'max_tokens' | 'max_completion_tokens'
  /** Send a budget even when the call names none (an aggregator sizes credit holds by it). */
  alwaysBudget?: boolean
  headers?: Record<string, string>
}

/** The two OpenAI-shaped search dialects, shared by the `openai` and `compatible` plugins. */
export interface OpenAiSearchHelper {
  /** Responses API with the `web_search` tool, a search forced (`tool_choice: 'required'`). */
  responses: (params: LlmSearchParams, endpoint: ResponsesSearchEndpoint) => Promise<LlmSearchOutput>
  /** Chat Completions; the endpoint's `body` decides how search is switched on. */
  chat: (params: LlmSearchParams, endpoint: ChatSearchEndpoint) => Promise<LlmSearchOutput>
  /**
   * The `web_search_options` body of a Chat-Completions search model. Domain filters have no
   * field there, so asking for one throws `LlmSearchUnsupportedError` rather than searching
   * unfiltered.
   */
  webSearchOptions: (options: WebSearchOptions) => Record<string, unknown>
}
