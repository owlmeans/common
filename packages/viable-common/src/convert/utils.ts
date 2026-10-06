import { conversionDocHelper } from './docs.js'

/** @deprecated compat:factory-refactor — use `conversionDocHelper.conversionStoryDoc(…)` */
export const conversionStoryDoc = (code: string): string => conversionDocHelper.conversionStoryDoc(code)

/** @deprecated compat:factory-refactor — use `conversionDocHelper.conversionSeedDoc(…)` */
export const conversionSeedDoc = (name: string): string => conversionDocHelper.conversionSeedDoc(name)
