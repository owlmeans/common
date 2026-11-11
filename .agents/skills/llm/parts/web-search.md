---
name: web-search
description: Provider-hosted web search through LlmService.webSearch — the Anthropic, OpenAI Responses, OpenRouter and Chat-search dialects, the options each honours, why no transport or proxy ever sees it, the forced search and the enforced domain bound.
metadata:
  purposes: agent, server-api
  mentions: webSearch, makeWebSearch, WebSearch, WebSearchResult, WebSearchOptions, WebSearchDialect, WebSearchConfig, LlmSearchError, LlmSearchUnsupportedError, LlmSearchDialect, ModelConfig.webSearch, web_search_20250305, openrouter:web_search, gpt-5-search-api
---

# @owlmeans/llm — Web search

## Asking

`llm.webSearch(alias, override?)` resolves the alias exactly as `getModel` does — presets, the
override, the output fit — takes the primary rung only, and returns a `WebSearch` bound to that
config (built per call, never memoised; it holds no client):

```ts
const answer = await context.llm().webSearch('researcher').search('What changed in Bun 1.4?', {
  maxUses: 2, contextSize: 'low', allowedDomains: ['bun.com'],
})
answer.text        // Markdown answer
answer.citations   // { url, title?, quote?, start?, end? } — start/end index into text when given
answer.sources     // every page consulted, deduplicated, cited ones included
answer.queries     // what the model searched for (when the provider reports it)
answer.searches    // billable searches reported (0 when not reported)
answer.errors      // in-body search failures and `out-of-domain` drops — the answer still came back
```

`makeWebSearch({ alias, config, secret, plugin, fetch? })` is the same object built by hand.
Options: `maxUses`, `maxResults`, `contextSize` (`low|medium|high`), `allowedDomains` XOR
`blockedDomains`, `location` (`country` ISO alpha-2, `region`, `city`, `timezone` IANA),
`instructions` (the answer's system prompt), `maxTokens`, `timeout`, `retries`, `signal`,
`action` and `spectator` (logged like a model call, call type `web-search`).

## Never through a transport

A search is one direct HTTPS request per attempt, sent with `binding.fetch` or `globalThis.fetch`
read at call time. It never consults `llmTransportRegistry` and never builds an SDK client (the
SDKs read `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` from the environment). So an installed LLM proxy
— which attaches to the transport registry — cannot reroute, re-key or re-model a search: `openai`
and `anthropic` configs search their official endpoints with the config's own key, exactly like
their chat clients ignore `baseUrl`; a `compatible` config searches its `baseUrl`. A deployment that
must send searches through its own egress passes `fetch` to `makeWebSearch`.

## Dialects are plugin members

`LlmPlugin.search?: LlmSearchDialect` runs one attempt in the provider's dialect and returns parts;
the search object validates options, retries, joins the parts (shifting citation offsets), dedupes
sources and records. Declare it per plugin, never in a family spread — `compatiblePlugin` spreads
`openAiFamily`, and an inherited dialect would send a gateway key to api.openai.com. A plugin
without one (a delegated model) answers `LlmSearchUnsupportedError`.

| Plugin | Dialect | Request | Notes |
|---|---|---|---|
| `anthropic` | `anthropic` | Messages API, server tool `web_search_20250305` (`ModelConfig.webSearch.tool` picks a newer version, which is sent with `allowed_callers: ['direct']`), `anthropic-version: 2023-06-01`, `x-api-key` | The chat build's thinking switch, effort table and adaptive output floor; no sampling knob. The tool is model-driven: pinned (`tool_choice: {type:'tool', name:'web_search'}`) on a model that accepts a pin, a "search first" directive where a pin is a 400 (`rejectsForcedTool`). `pause_turn` is resumed with the assistant content unchanged, up to 5 times; text before the first result is dropped as narration. |
| `openai` | `responses` | Responses API, `tools: [{ type: 'web_search' }]`, `tool_choice: 'required'`, `include: ['web_search_call.action.sources']`, `store: false`, `max_tool_calls` from `maxUses` | Whatever API the model's chat client uses. `webSearch.dialect: 'chat'` asks a Chat-Completions search model (`gpt-5-search-api`) instead. |
| `compatible` | by `baseUrl` host | `openrouter.ai` (and subdomains) → Chat Completions + `tools: [{ type: 'openrouter:web_search', parameters }]`, `max_tokens` always sent (OpenRouter holds credit against it); `api.openai.com` / `api.perplexity.ai` → Chat Completions + `web_search_options` | Any other host is unsupported unless `webSearch.dialect` (`openrouter` / `chat` / `responses`) names one: an endpoint that does not know a search field rejects it or, worse, answers unsearched. No sampling knobs, no `provider.require_parameters`; `reasoning` forwarded to OpenRouter only. `webSearch.engine` picks OpenRouter's engine. |

What each dialect honours — anything a dialect cannot honour throws, never silently drops:

| Option | anthropic | responses | openrouter | chat |
|---|---|---|---|---|
| `maxUses` | `max_uses` | `max_tool_calls` | `max_uses` | ignored (always searches) |
| `maxResults` | — | — | `max_results` | — |
| `contextSize` | — | `search_context_size` | `search_context_size` | `search_context_size` |
| `allowedDomains` / `blockedDomains` | `allowed_domains` / `blocked_domains` | `filters` | `allowed_domains` / `excluded_domains` | throws `LlmSearchUnsupportedError` |
| `location` | flat `user_location` | flat `user_location` | `user_location` | nested `user_location.approximate` |

## The answer

- Anthropic splits one answer into text blocks at citation boundaries: parts are joined with `''`,
  and a cited block's span is the whole block. Responses offsets are per `output_text` part and are
  shifted into the joined text; parts there are joined with a blank line. An OpenRouter citation
  through an Anthropic model has a 0–0 range: it is dropped, its excerpt kept as `quote`.
- A domain bound holds on the result even when the provider's own filter leaks (an Anthropic search
  under `allowed_domains` has returned other hosts): out-of-bound sources and citations are dropped
  and each is reported as `{ code: 'out-of-domain', message: url }`.
- An empty answer is an `LlmSearchError` (`incomplete` when cut by its budget, retried with a doubled
  one). Transient failures (network, 429, 5xx) are retried with backoff (`retry-after` honoured,
  capped at 30 s), `retries` attempts in all (default 2). Fatal at once: the caller's abort, a
  misconfiguration, 400/401/402/403/404/422, a 200 carrying an error body (OpenRouter's out-of-credit),
  and OpenAI's `insufficient_quota` 429. Error `detail` never carries the key.

## External docs

- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool — tool versions (`web_search_20250305` basic; `_20260209`/`_20260318` dynamic filtering through code execution, `allowed_callers: ['direct']` for a plain search), params, result/citation/error shapes, `pause_turn`, $10 per 1,000 searches (2026-11)
- https://developers.openai.com/api/docs/guides/tools-web-search — Responses `web_search` tool and filters, `include: web_search_call.action.sources`, `url_citation` annotations, `tool_choice: 'required'`; Chat Completions search only through `gpt-5-search-api` (2026-11)
- https://openrouter.ai/docs/guides/features/server-tools/web-search — `openrouter:web_search` server tool (beta) and its parameters; plugin `{ id: 'web' }` / `:online` deprecated; Chat Completions citations are nested `url_citation` objects and usage reports `server_tool_use_details.web_search_requests` (probed 2026-11-09)
