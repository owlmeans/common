import { IntrinsicStatus, WorkcardKind } from '../consts.js'
import type { PlanningFacade, Project, ProjectModel } from '../types.js'
import { makeWorkcardModel } from './workcard.js'

/** A workcard model plus the project's own reads: its cards, its sub-projects, its summary. */
export const makeProjectModel = (record: Project, facade: PlanningFacade): ProjectModel => {
  const model = makeWorkcardModel<Project>(record, facade)

  return {
    ...model,

    cards: query => facade.cards.list({ ...query, within: model.id, kind: WorkcardKind.Card }),

    projects: query => facade.cards.list({ ...query, within: model.id, kind: WorkcardKind.Project }),

    summary: async query => (await facade.cards.summary([model.id], query))[model.id] ?? {
      total: 0, [IntrinsicStatus.Planned]: 0, [IntrinsicStatus.InProgress]: 0, [IntrinsicStatus.Closed]: 0,
    },

    purge: opts => model.remove(opts),

    reload: async () => makeProjectModel(await facade.cards.get(model.id) as Project, facade),
  }
}
