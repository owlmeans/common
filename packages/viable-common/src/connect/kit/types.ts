

/** One status of a planning kit's flow. `intrinsic` is the planning intrinsic it maps to. */
export interface PlanningKitStatusView {
  key: string
  label: string
  intrinsic: string
}

/** One status flow a planning kit declares. */
export interface PlanningKitFlowView {
  key: string
  label: string
  statuses: PlanningKitStatusView[]
}

/** One card type a planning kit declares; `flow` is the key of its main flow. */
export interface PlanningKitTypeView {
  key: string
  label: string
  flow: string
}

/**
 * A planning kit as a connector sees it: a ready set of card types and status flows for one kind
 * of work-management product, written into the target's common package on `apply`.
 */
export interface PlanningKitView {
  id: string
  /** The work kind the kit serves — a bare string, so a newer kind never fails an older reader. */
  kind: string
  title: string
  purpose: string
  /** The project-level container type the kit's cards live in. */
  container: { key: string, label: string }
  types: PlanningKitTypeView[]
  flows: PlanningKitFlowView[]
}

/** What `project.kit.describe` answers. */
export interface ConnectKitDescribe {
  kits: PlanningKitView[]
}

/** Apply one kit; `types` keeps only these card-type keys of it (every type when omitted). */
export interface ConnectKitApplyBody {
  kit: string
  types?: string[]
}

/** What `project.kit.apply` answers: the type keys written, those left out, and warnings. */
export interface ConnectKitApplyResult {
  applied: string[]
  skipped: string[]
  warnings: string[]
}
