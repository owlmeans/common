import type { LlmSearchPart, LlmSearchParams, WebSearchCitation, WebSearchSource } from '../../search/types.js'
import { WebSearchDialect, WEB_SEARCH_MAX_TOKENS } from '../../search/consts.js'
import { LlmSearchUnsupportedError } from '../../errors.js'
import { configUtils } from '../../utils/config.js'
import { searchUtils } from '../../utils/search.js'
import { pluginUtils } from '../utils.js'
import type { OpenAiSearchHelper } from './search/types.js'
import type { ChatAnnotation, ChatSearchAnswer, ResponsesSearchAnswer } from './search/types.local.js'

export const createOpenAiSearchHelper = (): OpenAiSearchHelper => {
  const budget = ({ config, options, attempt }: LlmSearchParams): number =>
    pluginUtils.escalateMaxTokens(
      options.maxTokens ?? config.maxTokens ?? WEB_SEARCH_MAX_TOKENS, attempt, configUtils.resolveOutputCap(config),
    )

  const queriesOf = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter(q => typeof q === 'string') : []

  const responses: OpenAiSearchHelper['responses'] = async (params, endpoint) => {
    const { config, secret, input, options, fetch, signal } = params
    const model = config.model ?? ''
    const filters = {
      ...(options.allowedDomains != null ? { allowed_domains: options.allowedDomains } : {}),
      ...(options.blockedDomains != null ? { blocked_domains: options.blockedDomains } : {}),
    }
    const answer = await searchUtils.postJson({
      fetch, url: endpoint.url, signal, provider: endpoint.provider, secret,
      headers: { authorization: `Bearer ${secret}`, ...endpoint.headers, ...config.headers },
      body: {
        model,
        input,
        ...(options.instructions != null ? { instructions: options.instructions } : {}),
        tools: [{
          type: 'web_search',
          ...(options.contextSize != null ? { search_context_size: options.contextSize } : {}),
          ...(options.location != null ? { user_location: { type: 'approximate', ...options.location } } : {}),
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        store: false,
        max_output_tokens: budget(params),
        ...(options.maxUses != null ? { max_tool_calls: options.maxUses } : {}),
        ...(endpoint.effort != null ? { reasoning: { effort: endpoint.effort } } : {}),
      },
    }) as ResponsesSearchAnswer

    const queries: string[] = []
    const sources: WebSearchSource[] = []
    const parts: LlmSearchPart[] = []
    let searches = 0
    for (const item of answer.output ?? []) {
      if (item.type === 'web_search_call') {
        if (item.action?.type === 'search') {
          searches++
          queries.push(...queriesOf(item.action.query), ...queriesOf(item.action.queries))
        }
        for (const source of item.action?.sources ?? []) {
          if (typeof source.url === 'string') {
            sources.push({ url: source.url, ...(source.title != null ? { title: source.title } : {}) })
          }
        }
      } else if (item.type === 'message') {
        for (const content of item.content ?? []) {
          if (content.type !== 'output_text' || typeof content.text !== 'string') continue
          parts.push({
            text: content.text,
            // Offsets are relative to this output_text part; the join shifts them.
            citations: (content.annotations ?? [])
              .filter(annotation => annotation.type === 'url_citation' && typeof annotation.url === 'string')
              .map(annotation => ({
                url: annotation.url!,
                ...(annotation.title != null ? { title: annotation.title } : {}),
                ...searchUtils.range(annotation.start_index, annotation.end_index),
              })),
          })
        }
      }
    }

    return {
      dialect: WebSearchDialect.Responses,
      model: answer.model ?? model,
      parts,
      separator: '\n\n',
      sources,
      queries,
      searches,
      usage: { input: answer.usage?.input_tokens, output: answer.usage?.output_tokens },
      incomplete: answer.status === 'incomplete',
    }
  }

  const citationOf = (annotation: ChatAnnotation): WebSearchCitation | undefined => {
    if (annotation.type !== 'url_citation') return undefined
    const body = annotation.url_citation ?? annotation
    if (typeof body.url !== 'string') return undefined

    return {
      url: body.url,
      ...(body.title != null ? { title: body.title } : {}),
      ...(typeof body.content === 'string' && body.content.trim().length > 0 ? { quote: body.content.trim() } : {}),
      ...searchUtils.range(body.start_index, body.end_index),
    }
  }

  const chat: OpenAiSearchHelper['chat'] = async (params, endpoint) => {
    const { config, secret, input, options, fetch, signal } = params
    const model = config.model ?? ''
    const answer = await searchUtils.postJson({
      fetch, url: endpoint.url, signal, provider: endpoint.provider, secret,
      headers: { authorization: `Bearer ${secret}`, ...endpoint.headers, ...config.headers },
      body: {
        model,
        messages: [
          ...(options.instructions != null ? [{ role: 'system', content: options.instructions }] : []),
          { role: 'user', content: input },
        ],
        ...endpoint.body,
        // Search models take no sampling knobs, and the budget field differs by endpoint: only
        // sent when asked for, or where the endpoint holds credit against it.
        ...(options.maxTokens != null || endpoint.alwaysBudget === true ? { [endpoint.tokenParam]: budget(params) } : {}),
      },
    }) as ChatSearchAnswer

    const choice = answer.choices?.[0]
    const content = choice?.message?.content
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content) ? content.map(part => typeof part.text === 'string' ? part.text : '').join('') : ''
    const citations = (choice?.message?.annotations ?? [])
      .map(citationOf)
      .filter((citation): citation is WebSearchCitation => citation != null)
    const sources: WebSearchSource[] = [
      ...(answer.search_results ?? [])
        .filter(result => typeof result.url === 'string')
        .map(result => ({
          url: result.url!,
          ...(result.title != null ? { title: result.title } : {}),
          ...(result.date != null ? { age: result.date } : {}),
          ...(result.snippet != null ? { snippet: result.snippet } : {}),
        })),
      ...(answer.citations ?? []).filter((url): url is string => typeof url === 'string').map(url => ({ url })),
    ]
    const usage = answer.usage ?? {}

    return {
      dialect: endpoint.dialect,
      model: answer.model ?? model,
      parts: [{ text, citations }],
      sources,
      queries: [],
      searches: usage.server_tool_use_details?.web_search_requests ?? usage.server_tool_use?.web_search_requests,
      usage: { input: usage.prompt_tokens, output: usage.completion_tokens },
      incomplete: choice?.finish_reason === 'length',
    }
  }

  const webSearchOptions: OpenAiSearchHelper['webSearchOptions'] = options => {
    if (options.allowedDomains != null || options.blockedDomains != null) {
      throw new LlmSearchUnsupportedError('chat:domain-filters')
    }

    return {
      web_search_options: {
        ...(options.contextSize != null ? { search_context_size: options.contextSize } : {}),
        // Chat Completions nests the location one level deeper than the Responses API.
        ...(options.location != null ? { user_location: { type: 'approximate', approximate: options.location } } : {}),
      },
    }
  }

  return { responses, chat, webSearchOptions }
}

export const openAiSearchHelper = createOpenAiSearchHelper()
