import type { ConversionDecision, ConversionStage } from '../consts.js'

/** The conversion's stage ladder: what follows a stage, how to leave it, and what may be entered. */
export interface ConversionStageHelper {
  /**
   * The stage after this one.
   *
   * The last stage answers with itself: there is nothing after implementation, and returning
   * `undefined` would only move the same check to every call site.
   */
  stageAfter: (stage: ConversionStage) => ConversionStage
  /**
   * The decision that ADVANCES out of a stage.
   *
   * Implementation's is {@link ConversionDecision.Leave}, because a finished conversion has nothing
   * further to run and leaving it as it stands is the ordinary outcome rather than an abandonment.
   */
  decisionFor: (stage: ConversionStage) => ConversionDecision
  /**
   * Whether a conversion at `from` may enter `to`.
   *
   * The same stage is legal — that is a retry. The next one is legal. Nothing else is: every stage
   * reads the documents the stage before it wrote, so skipping one means running against documents
   * that were never produced, and going back means overwriting the record a later stage is built on.
   */
  canEnter: (from: ConversionStage, to: ConversionStage) => boolean
}
