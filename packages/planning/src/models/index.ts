import { WorkcardKind } from '../consts.js'
import type { PlanningFacade, Project, Specification, Workcard, WorkcardModel } from '../types.js'
import { makeProjectModel } from './project.js'
import { makeSpecificationModel } from './specification.js'
import { makeWorkcardModel } from './workcard.js'

export { executeFor, makeWorkcardModel } from './workcard.js'
export { makeProjectModel } from './project.js'
export { makeSpecificationModel } from './specification.js'

/** The model a record's kind calls for — what a facade's `model()` answers. */
export const modelOf = <T extends Workcard = Workcard>(record: T, facade: PlanningFacade): WorkcardModel<T> => {
  switch (record.kind) {
    case WorkcardKind.Project:
      return makeProjectModel(record as unknown as Project, facade) as unknown as WorkcardModel<T>
    case WorkcardKind.Specification:
      return makeSpecificationModel(record as unknown as Specification, facade) as unknown as WorkcardModel<T>
    default:
      return makeWorkcardModel(record, facade)
  }
}
