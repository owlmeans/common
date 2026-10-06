import { ModelEffort } from '@owlmeans/llm-common'

/** Model-name prefix that supports prompt caching through `cache_control` markers. */
export const CACHEABLE_PREFIX = 'claude-'

export const ALL_EFFORTS = [ModelEffort.Low, ModelEffort.Medium, ModelEffort.High, ModelEffort.XHigh, ModelEffort.Max]

export const NO_XHIGH = [ModelEffort.Low, ModelEffort.Medium, ModelEffort.High, ModelEffort.Max]

export const UP_TO_HIGH = [ModelEffort.Low, ModelEffort.Medium, ModelEffort.High]

/** Aggregators that encode the serving provider as a `model:provider` suffix. */
export const HUGGINGFACE_MARKER = 'huggingface'

/** How deep to follow `cause` before giving up — guards a self-referential chain. */
export const MAX_CAUSE_DEPTH = 8
