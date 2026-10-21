import type { PromptFocus } from '@owlmeans/llm-common'

/** The list fields of a {@link PromptFocus} — each merged down the execution chain as a union. */
export const FOCUS_LIST_KEYS = Object.freeze(['packages', 'purposes', 'parts', 'types'] as const) satisfies ReadonlyArray<keyof PromptFocus>
