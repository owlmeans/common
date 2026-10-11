import { memoHelper } from '@owlmeans/context'
import { TransitionAction, WorkcardKind, type PlanningFacade, type TransitionReceipt, type Workcard } from '@owlmeans/planning'
import { LIBRARY } from './consts.js'
import type { ConformanceFixtures } from './fixtures/types.js'

export const makeConformanceFixtures = (planning: PlanningFacade): ConformanceFixtures => {
  const createBranch = async (
    title: string = 'Riverside branch', extra: Record<string, unknown> = {}
  ): Promise<Workcard> => (await planning.execute({
    card: { kind: WorkcardKind.Project, type: LIBRARY.branch, title, ...extra },
    action: TransitionAction.Create,
  }, { wait: true })).card!

  const createBook = async (
    branch: string, title: string = 'A book', extra: Record<string, unknown> = {}
  ): Promise<Workcard> => (await planning.execute({
    card: { kind: WorkcardKind.Card, type: LIBRARY.book, parent: branch, title, ...extra },
    action: TransitionAction.Create,
  }, { wait: true })).card!

  const transit = async (
    card: string, transition: string, extra: { flow?: string } = {}
  ): Promise<TransitionReceipt> => await planning.execute({
    card, action: TransitionAction.Transit, transition, ...extra,
  }, { wait: true })

  return { createBranch, createBook, transit }
}

/** The fixtures of one facade — one per facade. */
export const conformanceFixturesOf = memoHelper.oncePer(makeConformanceFixtures)

/** @deprecated compat:factory-refactor — use `conformanceFixturesOf(planning).createBranch(…)` */
export const createBranch = async (
  planning: PlanningFacade, title: string = 'Riverside branch', extra: Record<string, unknown> = {}
): Promise<Workcard> => await conformanceFixturesOf(planning).createBranch(title, extra)

/** @deprecated compat:factory-refactor — use `conformanceFixturesOf(planning).createBook(…)` */
export const createBook = async (
  planning: PlanningFacade, branch: string, title: string = 'A book', extra: Record<string, unknown> = {}
): Promise<Workcard> => await conformanceFixturesOf(planning).createBook(branch, title, extra)

/** @deprecated compat:factory-refactor — use `conformanceFixturesOf(planning).transit(…)` */
export const transit = async (
  planning: PlanningFacade, card: string, transition: string, extra: { flow?: string } = {}
): Promise<TransitionReceipt> => await conformanceFixturesOf(planning).transit(card, transition, extra)
