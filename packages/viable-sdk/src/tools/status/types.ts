import type { ConnectPipelineState, ConnectProjectStatus, ConnectSlotView, ConnectStoryStatus, ConversionStatusView, StoryBatchView } from '@owlmeans/viable-common'
import type { StoryStatusExtra } from '../types.js'

/** Every domain status as text a parent agent reads — each one ending in the next valid action. */
export interface StatusTextHelper {
  /** A project's status as a parent reads it, ending in the next valid action. */
  renderProjectStatus: (status: ConnectProjectStatus) => string
  /** A story's status as a parent reads it, ending in the next valid action. */
  renderStoryStatus: (status: ConnectStoryStatus, extra?: StoryStatusExtra) => string
  /** A pipeline run's state as a parent reads it, ending in the next valid action. */
  renderPipelineStatus: (state: ConnectPipelineState) => string
  /**
   * One workload in one line — kind, status, address, project — then one line per warning it
   * carries, each phrased like a refusal.
   */
  renderSlot: (slot: ConnectSlotView) => string
  /** The next valid action of a conversion, from what it waits for and the stage it is at. */
  conversionNext: (view: ConversionStatusView) => string
  /**
   * A story batch as a parent reads it: its stories in implementation order, each with where it
   * stands and the ordering's reason for its place, the progress, why it halted — ending in the
   * next valid action.
   */
  renderBatchStatus: (view: StoryBatchView) => string
}
