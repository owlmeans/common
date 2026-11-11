/** The slice of a Responses-API answer a search reads. */
export interface ResponsesSearchAnswer {
  model?: string
  status?: string
  output?: ResponsesSearchItem[]
  usage?: { input_tokens?: number, output_tokens?: number }
}

export interface ResponsesSearchItem {
  type?: string
  action?: {
    type?: string
    query?: unknown
    queries?: unknown
    sources?: { type?: string, url?: string, title?: string }[]
  }
  content?: { type?: string, text?: string, annotations?: ResponsesAnnotation[] }[]
}

export interface ResponsesAnnotation {
  type?: string
  url?: string
  title?: string
  start_index?: number
  end_index?: number
}

/** The slice of a Chat-Completions answer a search reads — OpenAI, OpenRouter and Perplexity shapes. */
export interface ChatSearchAnswer {
  model?: string
  choices?: {
    finish_reason?: string
    message?: {
      content?: string | { type?: string, text?: string }[] | null
      annotations?: ChatAnnotation[]
    }
  }[]
  /** Perplexity: cited URLs. */
  citations?: unknown[]
  /** Perplexity: the results behind them. */
  search_results?: { url?: string, title?: string, date?: string, snippet?: string }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    server_tool_use_details?: { web_search_requests?: number }
    server_tool_use?: { web_search_requests?: number }
  }
}

/** Nested (`url_citation: {...}`, OpenAI/OpenRouter chat) or flat (Responses-style) citation. */
export interface ChatAnnotation {
  type?: string
  url_citation?: ChatCitationBody
  url?: string
  title?: string
  content?: string
  start_index?: number
  end_index?: number
}

export interface ChatCitationBody {
  url?: string
  title?: string
  content?: string
  start_index?: number
  end_index?: number
}
