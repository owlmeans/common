import { conversionDocHelper } from './docs.js'

/** @deprecated compat:factory-refactor — use `conversionDocHelper.conversionWorkcardDoc(…)` */
export const conversionWorkcardDoc = (code: string): string => conversionDocHelper.conversionWorkcardDoc(code)

/** @deprecated compat:factory-refactor — use `conversionDocHelper.conversionSeedDoc(…)` */
export const conversionSeedDoc = (name: string): string => conversionDocHelper.conversionSeedDoc(name)
