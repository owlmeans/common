import type { PlanningFacade, Specification, SpecificationModel } from '../types.js'
import { makeWorkcardModel } from './workcard.js'

/** A workcard model over one document: its body, a revision of it, and its history from the log. */
export const makeSpecificationModel = (record: Specification, facade: PlanningFacade): SpecificationModel => {
  const model = makeWorkcardModel<Specification>(record, facade)

  return {
    ...model,

    body: () => record.body,

    revise: (body, opts) => model.update(Object.fromEntries(Object.entries({
      body, version: opts?.version, ref: opts?.ref,
    }).filter(([, value]) => value !== undefined)), opts),

    history: limit => facade.specifications.revisions(model.id, limit),

    reload: async () => makeSpecificationModel(await facade.specifications.get(model.id), facade),
  }
}
