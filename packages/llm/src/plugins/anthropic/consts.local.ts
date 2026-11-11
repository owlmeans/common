import { ThinkingOff } from '../consts.js'

/**
 * Every `thinking.type` that switches thinking off — a lookup built from the {@link ThinkingOff}
 * enum at load. It lives in its own file because `plugins/consts.local.ts` cannot import
 * `plugins/consts.ts` back.
 */
export const THINKING_OFF_TYPES = new Set<string>(Object.values(ThinkingOff))

/** The Messages API — the official endpoint, never a configured `baseUrl` (as the chat client). */
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

/**
 * The API version a search is asked in. Pinned to the version the chat client sends, so a search
 * and a chat call on one model are the same API surface.
 */
export const ANTHROPIC_API_VERSION = '2023-06-01'

/** The basic web search tool: every model, no code-execution dependency. */
export const ANTHROPIC_SEARCH_TOOL = 'web_search_20250305'

/** Model a search config without one is asked with — the chat plugin's default. */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5'

/** How many times a `pause_turn` is resumed before the partial answer is returned. */
export const ANTHROPIC_SEARCH_CONTINUATIONS = 5

/**
 * What a model that refuses a pinned tool is told instead — the tool is model-driven there, and a
 * well-known question is otherwise answered from memory, unsearched.
 */
export const ANTHROPIC_SEARCH_DIRECTIVE = 'Search the web before you answer, and answer from what the search found.'
