import type { CacheTtlPolicy } from '@owlmeans/llm-common'

/** The breakpoints of the prompt layout in prefix order — the order a lifetime may only fall along. */
export const TTL_KEYS: ReadonlyArray<keyof CacheTtlPolicy> = Object.freeze(['skills', 'packages', 'project', 'stable'])
