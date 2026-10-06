import { WorkcardKind } from '../consts.js'
import type { PlanningFacade, Project, Specification, Workcard } from '../types.js'
import { makeProjectModel } from './project.js'
import { makeSpecificationModel } from './specification.js'
import type { WorkcardModel } from './types.js'
import { makeWorkcardModel } from './workcard.js'

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
