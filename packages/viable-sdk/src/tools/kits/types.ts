import type { ConnectKitApplyResult, PlanningKitView } from '@owlmeans/viable-common'

/** The planning kits a project is offered, and the result of applying one, as a parent reads them. */
export interface KitsUtils {
  /**
   * Every kit offered for a project: what it is for, the container its cards live in, each card
   * type with its main flow, and each flow's statuses in order (the planning intrinsic in brackets).
   */
  renderKits: (projectId: string, kits: PlanningKitView[]) => string
  /** What applying a kit wrote, left out and warned about. */
  renderKitApply: (projectId: string, kit: string, result: ConnectKitApplyResult) => string
}
