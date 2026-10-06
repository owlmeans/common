import type { UserStory } from '../ba/types.js'
import type { DesignStaleness } from './consts.js'
import { storyDesignHelper } from './story.js'
import type { StoryDesign } from './types.js'

/** @deprecated compat:factory-refactor — use `storyDesignHelper.userStoryOfDesign(…)` */
export const userStoryOfDesign = (design: StoryDesign): UserStory => storyDesignHelper.userStoryOfDesign(design)

/** @deprecated compat:factory-refactor — use `storyDesignHelper.screenMapOf(…)` */
export const screenMapOf = (design: StoryDesign): Record<string, string[]> => storyDesignHelper.screenMapOf(design)

/** @deprecated compat:factory-refactor — use `storyDesignHelper.designPaths(…)` */
export const designPaths = (design: StoryDesign): string[] => storyDesignHelper.designPaths(design)

/** @deprecated compat:factory-refactor — use `storyDesignHelper.designStaleness(…)` */
export const designStaleness = (
  design: StoryDesign,
  now: { narrativeHash: string, projectHash: string, registryHash: string },
): DesignStaleness => storyDesignHelper.designStaleness(design, now)

/** @deprecated compat:factory-refactor — use `storyDesignHelper.designHash(…)` */
export const designHash = (...parts: Array<string | undefined>): string => storyDesignHelper.designHash(...parts)

/** @deprecated compat:factory-refactor — use `storyDesignHelper.emptyStoryDesign(…)` */
export const emptyStoryDesign = (
  input: Pick<StoryDesign, 'code' | 'narrative' | 'area'> & Partial<StoryDesign>,
): StoryDesign => storyDesignHelper.emptyStoryDesign(input)

/** @deprecated compat:factory-refactor — use `storyDesignHelper.designDigest(…)` */
export const designDigest = (design: StoryDesign): string => storyDesignHelper.designDigest(design)

/** @deprecated compat:factory-refactor — use `storyDesignHelper.amendStoryDesign(…)` */
export const amendStoryDesign = (design: StoryDesign, patch: Record<string, unknown>): StoryDesign | string =>
  storyDesignHelper.amendStoryDesign(design, patch)
