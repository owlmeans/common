import { ConversionDecision, ConversionStage, CONVERSION_STAGE_ORDER } from './consts.js'
import type { ConversionStageHelper } from './stage/types.js'

export const createConversionStageHelper = (): ConversionStageHelper => {
  const stageAfter = (stage: ConversionStage): ConversionStage => {
    const at = CONVERSION_STAGE_ORDER.indexOf(stage)

    return CONVERSION_STAGE_ORDER[at + 1] ?? stage
  }

  const decisionFor = (stage: ConversionStage): ConversionDecision => {
    switch (stage) {
      case ConversionStage.Intake: return ConversionDecision.Analyze
      case ConversionStage.Analysis: return ConversionDecision.Extract
      case ConversionStage.Extraction: return ConversionDecision.Implement
      default: return ConversionDecision.Leave
    }
  }

  const canEnter = (from: ConversionStage, to: ConversionStage): boolean => {
    const at = CONVERSION_STAGE_ORDER.indexOf(from)
    const next = CONVERSION_STAGE_ORDER.indexOf(to)
    if (at < 0 || next < 0) return false

    return next === at || next === at + 1
  }

  return { stageAfter, decisionFor, canEnter }
}

export const conversionStageHelper = createConversionStageHelper()
