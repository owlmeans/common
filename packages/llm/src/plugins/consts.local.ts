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

/**
 * Content blocks Anthropic accepts a `cache_control` on as a message's last block. Thinking blocks
 * are not among them, and an empty text block is a 400 of its own.
 */
export const ANTHROPIC_MARKABLE_BLOCKS: ReadonlySet<string> = new Set([
  'text', 'image', 'image_url', 'document', 'file', 'tool_use', 'tool_result',
])

/** Content blocks the OpenAI Responses converter carries a `prompt_cache_breakpoint` on. */
export const OPENAI_MARKABLE_BLOCKS: ReadonlySet<string> = new Set([
  'text', 'input_text', 'image_url', 'input_image', 'input_file', 'file',
])

/** Tool-output items OpenAI keeps as provider-native content (and so keeps a breakpoint on). */
export const OPENAI_TOOL_OUTPUT_BLOCKS: ReadonlySet<string> = new Set(['input_text', 'input_image', 'input_file'])

/** The marker an explicit-mode breakpoint carries on a content block. */
export const OPENAI_BREAKPOINT = Object.freeze({ mode: 'explicit' })

/**
 * Anthropic's automatic caching: a top-level `cache_control` marks the last cacheable block of the
 * request, so a tool loop's marker moves forward round by round. It spends one of the four slots.
 */
export const ANTHROPIC_AUTOMATIC_MARKER = Object.freeze({ type: 'ephemeral' })

/** The request option that switches OpenAI to explicit mode — sent only when a breakpoint is placed. */
export const OPENAI_EXPLICIT_OPTIONS = Object.freeze({ promptCacheOptions: Object.freeze({ mode: 'explicit' }) })
