import { ThinkingOff } from '../consts.js'

/**
 * Every `thinking.type` that switches thinking off — a lookup built from the {@link ThinkingOff}
 * enum at load. It lives in its own file because `plugins/consts.local.ts` cannot import
 * `plugins/consts.ts` back.
 */
export const THINKING_OFF_TYPES = new Set<string>(Object.values(ThinkingOff))
