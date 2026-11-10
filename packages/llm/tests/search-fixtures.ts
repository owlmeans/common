/**
 * Provider answers shaped like the documented (and, for OpenRouter, the probed) responses, trimmed
 * to what a search reads. Encrypted fields are placeholders.
 */

/** Anthropic: a turn paused after the search started… */
export const anthropicPaused = {
  model: 'claude-haiku-5-5',
  stop_reason: 'pause_turn',
  content: [
    { type: 'text', text: 'Let me search for that.' },
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'claude shannon birth date' } },
  ],
  usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 1 } },
}

/** …and resumed: results, then the answer split at citation boundaries. */
export const anthropicResumed = {
  model: 'claude-haiku-5-5',
  stop_reason: 'end_turn',
  content: [
    {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_1',
      content: [{
        type: 'web_search_result', url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
        title: 'Claude Shannon - Wikipedia', encrypted_content: 'enc', page_age: 'April 30, 2025',
      }],
    },
    { type: 'text', text: 'Based on the search results, ' },
    {
      type: 'text',
      text: 'Claude Shannon was born on April 30, 1916',
      citations: [{
        type: 'web_search_result_location', url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
        title: 'Claude Shannon - Wikipedia', encrypted_index: 'idx', cited_text: 'Claude Elwood Shannon (April 30, 1916 – …',
      }],
    },
    { type: 'text', text: '.' },
  ],
  usage: { input_tokens: 2000, output_tokens: 40, cache_read_input_tokens: 500, server_tool_use: { web_search_requests: 0 } },
}

/** Anthropic: the search itself failed, the model still answered. */
export const anthropicSearchFailed = {
  model: 'claude-haiku-5-5',
  stop_reason: 'end_turn',
  content: [
    { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_2', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
    { type: 'text', text: 'I could not complete the search.' },
  ],
  usage: { input_tokens: 50, output_tokens: 8 },
}

/** OpenAI Responses: reasoning, a search call with sources, two output_text parts. */
export const responsesAnswer = {
  model: 'gpt-5.4-mini-2026-03-17',
  status: 'completed',
  output: [
    { type: 'reasoning', id: 'rs_1', summary: [] },
    {
      type: 'web_search_call', id: 'ws_1', status: 'completed',
      action: {
        type: 'search', query: 'latest bun release',
        sources: [{ type: 'url', url: 'https://bun.com/blog' }, { type: 'url', url: 'https://bun.sh/' }],
      },
    },
    {
      type: 'message', id: 'msg_1', role: 'assistant',
      content: [
        {
          type: 'output_text', text: 'Bun 1.4.4 is current (bun.sh).',
          annotations: [{ type: 'url_citation', url: 'https://bun.sh/', title: 'Bun', start_index: 21, end_index: 29 }],
        },
        {
          type: 'output_text', text: 'Released in October.',
          annotations: [{ type: 'url_citation', url: 'https://bun.com/blog', title: 'Bun Blog', start_index: 0, end_index: 20 }],
        },
      ],
    },
  ],
  usage: { input_tokens: 8000, output_tokens: 90 },
}

/** OpenRouter Chat Completions with the server tool (probed 2026-11-09). */
export const openRouterAnswer = {
  id: 'gen-1',
  model: 'anthropic/claude-haiku-5.5',
  choices: [{
    finish_reason: 'stop',
    message: {
      role: 'assistant',
      content: 'The latest stable release is Bun v1.4.4. Source: https://bun.com/',
      annotations: [{
        type: 'url_citation',
        url_citation: { url: 'https://bun.com/', title: 'Bun', start_index: 0, end_index: 0, content: 'v1.4.4 Latest release · October 2026 ' },
      }],
    },
  }],
  usage: { prompt_tokens: 20121, completion_tokens: 384, server_tool_use_details: { web_search_requests: 1 } },
}

/** A Chat-Completions search model (`gpt-5-search-api`). */
export const chatSearchAnswer = {
  model: 'gpt-5-search-api-2025-10-14',
  choices: [{
    finish_reason: 'stop',
    message: {
      role: 'assistant',
      content: 'Bun v1.4.4 ([bun.com](https://bun.com/)).',
      annotations: [{ type: 'url_citation', url_citation: { url: 'https://bun.com/', title: 'Bun', start_index: 11, end_index: 40 } }],
    },
  }],
  usage: { prompt_tokens: 16000, completion_tokens: 60 },
}

/** OpenRouter reports some failures as a 200 carrying an error. */
export const openRouterEmbeddedError = { error: { code: 402, message: 'This request requires more credits' } }
