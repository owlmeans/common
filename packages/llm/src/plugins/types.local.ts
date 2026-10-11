import { ChatAnthropic } from '@langchain/anthropic'
import { ModelEffort } from '@owlmeans/llm-common'
import { ChatOpenAI } from '@langchain/openai'

export interface AnthropicKwargs extends Omit<Partial<ChatAnthropic>, 'outputConfig' | 'thinking'> {
  outputConfig?: { effort?: ModelEffort } & Record<string, unknown>
  thinking?: { type?: string }
}

/** langchain types the wire values as a literal union; `ModelEffort` holds the same strings. */
export type WireOutputConfig = NonNullable<ConstructorParameters<typeof ChatAnthropic>[0]>['outputConfig']

/**
 * The SDK's `thinking` union predates `between_tools`; langchain forwards the object as given
 * (`thinking` of an explicitly configured model goes on the wire unchanged).
 */
export type WireThinking = NonNullable<ConstructorParameters<typeof ChatAnthropic>[0]>['thinking']

// Kept as a type: a content block is read and written by arbitrary key (implicit index signature).
export type ContentBlock = Record<string, unknown>

/**
 * The request's `reasoning` object travels in `modelKwargs`, never in the constructor's
 * `reasoning` field. `@langchain/openai` puts that field on the wire only for model names it
 * recognises as reasoning models (`o*`, `gpt-5*`), so on `gpt-6-*` a configured effort was
 * silently dropped from every request. `modelKwargs` is spread verbatim into the Responses body
 * for every model, and langchain adds its own `reasoning` key only when the constructor field (or
 * a call option) is set — which this plugin never does — so the key goes out exactly once.
 */
// Kept as a type: it extends an indexed-access type, which an interface cannot name in `extends`.
export type OpenAiKwargs = ConstructorParameters<typeof ChatOpenAI>[0] & {
  modelKwargs?: { reasoning?: { max_tokens?: number, effort?: string } & Record<string, unknown> } & Record<string, unknown>
}
