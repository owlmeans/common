/** The slice of an Anthropic Messages response a search reads. */
export interface AnthropicSearchBlock {
  type: string
  text?: string
  citations?: AnthropicSearchCitation[] | null
  name?: string
  input?: { query?: unknown }
  /** `web_search_tool_result`: the results, or an error object in place of the list. */
  content?: AnthropicSearchResult[] | { type?: string, error_code?: string }
}

export interface AnthropicSearchCitation {
  type?: string
  url?: string
  title?: string
  cited_text?: string
}

export interface AnthropicSearchResult {
  type?: string
  url?: string
  title?: string
  page_age?: string
}

export interface AnthropicSearchResponse {
  model?: string
  content?: AnthropicSearchBlock[]
  stop_reason?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
    server_tool_use?: { web_search_requests?: number }
  }
}
