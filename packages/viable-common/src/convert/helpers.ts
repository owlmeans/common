import type { ConversionDecision, ConversionStage, EntropyClass, FileClass, SizeClass } from './consts.js'
import { censusHelper } from './census.js'
import { conversionOriginHelper } from './origin.js'
import type { OriginCard } from './origin/types.js'
import { conversionStageHelper } from './stage.js'

/** @deprecated compat:factory-refactor — use `censusHelper.sizeClassOf(…)` */
export const sizeClassOf = (bytes: number): SizeClass => censusHelper.sizeClassOf(bytes)

/** @deprecated compat:factory-refactor — use `censusHelper.fileClassOf(…)` */
export const fileClassOf = (path: string, ext: string): FileClass => censusHelper.fileClassOf(path, ext)

/** @deprecated compat:factory-refactor — use `censusHelper.binaryByExtension(…)` */
export const binaryByExtension = (path: string): boolean | null => censusHelper.binaryByExtension(path)

/** @deprecated compat:factory-refactor — use `censusHelper.entropyClassOf(…)` */
export const entropyClassOf = (head: string): EntropyClass => censusHelper.entropyClassOf(head)

/** @deprecated compat:factory-refactor — use `censusHelper.isBulkPath(…)` */
export const isBulkPath = (path: string): boolean => censusHelper.isBulkPath(path)

/** @deprecated compat:factory-refactor — use `censusHelper.isSeedPath(…)` */
export const isSeedPath = (path: string): boolean => censusHelper.isSeedPath(path)

/** @deprecated compat:factory-refactor — use `conversionStageHelper.stageAfter(…)` */
export const stageAfter = (stage: ConversionStage): ConversionStage => conversionStageHelper.stageAfter(stage)

/** @deprecated compat:factory-refactor — use `conversionStageHelper.decisionFor(…)` */
export const decisionFor = (stage: ConversionStage): ConversionDecision => conversionStageHelper.decisionFor(stage)

/** @deprecated compat:factory-refactor — use `conversionOriginHelper.originCardChars(…)` */
export const originCardChars = (card: OriginCard): number => conversionOriginHelper.originCardChars(card)

/** @deprecated compat:factory-refactor — use `conversionOriginHelper.originCardFits(…)` */
export const originCardFits = (card: OriginCard): boolean => conversionOriginHelper.originCardFits(card)

/** @deprecated compat:factory-refactor — use `conversionOriginHelper.isOriginPath(…)` */
export const isOriginPath = (path: string): boolean => conversionOriginHelper.isOriginPath(path)

/** @deprecated compat:factory-refactor — use `conversionOriginHelper.originPath(…)` */
export const originPath = (relative: string): string => conversionOriginHelper.originPath(relative)
