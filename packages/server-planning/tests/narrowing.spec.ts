import { describe, expect, test } from 'bun:test'
import { WorkcardKind, WorkcardNotFound } from '@owlmeans/planning'
import type { PlanningFacade, Workcard } from '@owlmeans/planning'
import { createProject, createTask, ENTITY, makeTestPlanning, PROFILE } from './context.js'

/**
 * Two projects with a task each, a design document on each task and a plan on the first project —
 * a specification's `parents` hold only its own card, so a scope narrowed to one project sees the
 * task's document through the task.
 */
const fixture = async () => {
  const planning = await makeTestPlanning()
  const owner = planning.facade()
  const granted = await createProject(owner, 'Granted')
  const hidden = await createProject(owner, 'Hidden')
  const seen = (await createTask(owner, granted.id!, 'Seen')).card!
  const unseen = (await createTask(owner, hidden.id!, 'Unseen')).card!
  const write = async (card: Workcard, category: string, body: string): Promise<Workcard> =>
    (await (await owner.model(card)).write(category, body, { wait: true })).card!
  const design = await write(seen, 'design', '{"steps":[1]}')
  const hiddenDesign = await write(unseen, 'design', '{"steps":[2]}')
  const plan = await write(granted, 'plan', '{"steps":[3]}')
  const scoped = (projects: string[]): PlanningFacade =>
    planning.service.for({ entityId: ENTITY, profileId: PROFILE, channel: 'test', projects })

  return { ...planning, owner, granted, hidden, seen, unseen, design, hiddenDesign, plan, scoped }
}

const ids = (items: Workcard[]): string[] => items.map(card => card.id!).sort()

describe('@owlmeans/server-planning — a narrowed scope lists what it reads', () => {
  test('a granted card\'s specification is listed and counted as it is read', async () => {
    const { seen, unseen, design, hiddenDesign, plan, granted, scoped } = await fixture()
    const member = scoped([granted.id!])

    expect((await member.cards.get(design.id!)).id).toBe(design.id!)
    await expect(member.cards.get(hiddenDesign.id!)).rejects.toBeInstanceOf(WorkcardNotFound)

    const underCard = await member.cards.list({ parent: seen.id!, kind: WorkcardKind.Specification })
    expect(ids(underCard.items)).toEqual([design.id!])
    expect(underCard.total).toBe(1)
    expect(await member.cards.count({ parent: seen.id!, kind: WorkcardKind.Specification })).toBe(1)
    expect((await member.cards.list({ parent: unseen.id!, kind: WorkcardKind.Specification })).items).toEqual([])
    expect(await member.cards.count({ parent: unseen.id! })).toBe(0)

    const everyDocument = await member.cards.list({ kind: WorkcardKind.Specification })
    expect(ids(everyDocument.items)).toEqual([design.id!, plan.id!].sort())
    expect(await member.cards.count({ kind: WorkcardKind.Specification })).toBe(2)
    expect(ids((await member.cards.list({ kind: WorkcardKind.Card })).items)).toEqual([seen.id!])

    expect(ids((await member.cards.list({ parent: seen.id!, category: 'design' })).items)).toEqual([design.id!])
    expect((await member.specifications.list(seen.id!)).total).toBe(1)
    // A summary counts a parent's cards, never its documents.
    expect(Object.keys(await member.cards.summary([granted.id!, seen.id!, unseen.id!]))).toEqual([granted.id!])
  })

  test('every card the narrowed scope reads is the one it lists, and no other', async () => {
    const { owner, granted, scoped } = await fixture()
    const member = scoped([granted.id!])
    const every = { size: 0, kind: [WorkcardKind.Project, WorkcardKind.Card, WorkcardKind.Specification] }
    const everything = (await owner.cards.list(every)).items
    const listed = new Set(ids((await member.cards.list(every)).items))

    expect(everything.length).toBe(7)
    for (const card of everything) {
      expect([card.id, (await member.cards.load(card.id!)) != null]).toEqual([card.id, listed.has(card.id!)])
    }
    expect(listed.size).toBe(4)
    expect(await member.cards.count(every)).toBe(listed.size)
  })

  test('a scope with no project, or another one, sees none of the granted project\'s documents', async () => {
    const { seen, design, plan, hidden, scoped } = await fixture()

    for (const outsider of [scoped([]), scoped([hidden.id!])]) {
      await expect(outsider.cards.get(design.id!)).rejects.toBeInstanceOf(WorkcardNotFound)
      expect((await outsider.cards.list({ parent: seen.id!, kind: WorkcardKind.Specification })).items).toEqual([])
      expect(await outsider.cards.count({ parent: seen.id! })).toBe(0)
      const documents = ids((await outsider.cards.list({ kind: WorkcardKind.Specification })).items)
      expect(documents).not.toContain(design.id!)
      expect(documents).not.toContain(plan.id!)
    }
    expect((await scoped([]).cards.list({ size: 0, kind: [WorkcardKind.Card, WorkcardKind.Specification] })).total).toBe(0)
  })

  test('an unnarrowed scope sees every document of the organization', async () => {
    const { owner, unseen, design, hiddenDesign, plan } = await fixture()

    expect(ids((await owner.cards.list({ kind: WorkcardKind.Specification })).items))
      .toEqual([design.id!, hiddenDesign.id!, plan.id!].sort())
    expect(await owner.cards.count({ kind: WorkcardKind.Specification })).toBe(3)
    expect(ids((await owner.cards.list({ parent: unseen.id!, kind: WorkcardKind.Specification })).items)).toEqual([hiddenDesign.id!])
  })
})
