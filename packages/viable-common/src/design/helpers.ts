import type { UserStory } from '../ba/types.js'
import type { DesignStaleness } from './consts.js'
import { workcardDesignHelper } from './workcard.js'
import type { WorkcardDesign } from './types.js'

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.userStoryOfDesign(…)` */
export const userStoryOfDesign = (design: WorkcardDesign): UserStory => workcardDesignHelper.userStoryOfDesign(design)

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.screenMapOf(…)` */
export const screenMapOf = (design: WorkcardDesign): Record<string, string[]> => workcardDesignHelper.screenMapOf(design)

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.designPaths(…)` */
export const designPaths = (design: WorkcardDesign): string[] => workcardDesignHelper.designPaths(design)

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.designStaleness(…)` */
export const designStaleness = (
  design: WorkcardDesign,
  now: { narrativeHash: string, projectHash: string, registryHash: string },
): DesignStaleness => workcardDesignHelper.designStaleness(design, now)

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.designHash(…)` */
export const designHash = (...parts: Array<string | undefined>): string => workcardDesignHelper.designHash(...parts)

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.emptyWorkcardDesign(…)` */
export const emptyWorkcardDesign = (
  input: Pick<WorkcardDesign, 'code' | 'narrative' | 'area'> & Partial<WorkcardDesign>,
): WorkcardDesign => workcardDesignHelper.emptyWorkcardDesign(input)

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.designDigest(…)` */
export const designDigest = (design: WorkcardDesign): string => workcardDesignHelper.designDigest(design)

/** @deprecated compat:factory-refactor — use `workcardDesignHelper.amendWorkcardDesign(…)` */
export const amendWorkcardDesign = (design: WorkcardDesign, patch: Record<string, unknown>): WorkcardDesign | string =>
  workcardDesignHelper.amendWorkcardDesign(design, patch)
