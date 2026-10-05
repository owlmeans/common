import type { ConnectPipelineState, ConnectProjectStatus, ConnectStoryStatus, ConversionStatusView } from '@owlmeans/viable-common'
import type { StoryStatusExtra } from '../types.js'

/** Every domain status as text a parent agent reads — each one ending in the next valid action. */
export interface StatusTextHelper {
  /** A project's status as a parent reads it, ending in the next valid action. */
  renderProjectStatus: (status: ConnectProjectStatus) => string
  /** A story's status as a parent reads it, ending in the next valid action. */
  renderStoryStatus: (status: ConnectStoryStatus, extra?: StoryStatusExtra) => string
  /** A pipeline run's state as a parent reads it, ending in the next valid action. */
  renderPipelineStatus: (state: ConnectPipelineState) => string
  /** The next valid action of a conversion, from what it waits for and the stage it is at. */
  conversionNext: (view: ConversionStatusView) => string
}
