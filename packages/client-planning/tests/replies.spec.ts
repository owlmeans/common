import { expect, test } from 'bun:test'
import { AssigneeKind, mentionHelper, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { ENTITY_ID, makeSuite, STORY_FLOW } from './context.js'

test('stock HTTP and socket replies omit storage organization metadata and preserve usable client records', async () => {
  const suite = await makeSuite({ resources: true, socket: true })
  const p = suite.planning
  const unsubscribe = await p.commits.subscribe(() => {})
  const project = await suite.project()
  const fields = { scope: { entityId: 'custom-field-value' }, card: { entityId: 'opaque-field-value' } }
  const created = await p.execute({ action: TransitionAction.Create,
    card: { kind: WorkcardKind.Project, type: project.type, title: 'Remote project', fields },
  }, { wait: true })
  expect(created.card?.entityId).toBe('')
  expect(created.transition.entityId).toBe('')
  expect(created.card?.fields).toEqual(fields)
  expect((await suite.local.cards.get(created.card!.id!)).entityId).toBe(ENTITY_ID)
  const card = await suite.story(project.id!)
  await p.cards.get(card.id!)
  await p.cards.list({ size: 0 })
  await p.transitions.get(created.transition.id!)
  await p.transitions.list({ card: created.card!.id! })
  await p.commits.status(created.transition.id!)
  const model = await p.model(project.id!)
  await model.write('brief', '# Saved', { wait: true })
  const specification = await p.specifications.current(project.id!, 'brief')
  await p.specifications.get(specification!.id!)
  await p.specifications.list(project.id!)
  await p.specifications.revisions(specification!.id!)
  const actor = await p.assignees.create({ nickname: 'wire-reader', kind: AssigneeKind.Human,
    type: 'test:participant', authentication: { provider: 'external', externalId: 'subject' } })
  const team = await p.teams.create({ name: 'Wire team' })
  await p.teams.addMember(team.id!, actor.id!)
  await p.teams.attach(team.id!, project.id!)
  for (const name of ['assignees', 'teams'] as const) {
    const id = name === 'assignees' ? actor.id! : team.id!
    await p[name].get(id)
    await p[name].list()
  }
  expect((await p.teams.members(team.id!))[0]?.entityId).toBe('')
  expect((await p.teams.assignees(project.id!))[0]?.id).toBe(actor.id)
  expect(await p.teams.projects(team.id!)).toEqual([project.id!])
  const comment = await p.comments.create({ card: card.id!, body: mentionHelper.encode(actor.id!, actor.nickname) })
  await p.comments.get(comment.id!)
  await p.comments.list()
  const mentions = await p.mentions.list()
  await p.mentions.get(mentions.items[0]!.id!)
  await p.mentions.rebuild(comment.id!)
  await p.relationships.list()
  const definitions = await p.definitions!.define({ types: [{ type: 'test:wire', kind: WorkcardKind.Card,
    version: 1, fields: { type: 'object', properties: { scope: { type: 'object', properties: { entityId: { type: 'string' } } } } },
    flows: [STORY_FLOW], specifications: [],
  }] }, { project: project.id })
  expect(definitions[0]?.entityId).toBe('')
  expect((await p.definitions!.bundle(project.id)).scope?.entityId).toBe('')

  // Check the actual server responses before the client hydrates its advisory metadata.
  for (const call of suite.calls) {
    expect(JSON.stringify(call.reply) ?? '').not.toContain(ENTITY_ID)
    const check = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(check); return }
      if (value == null || typeof value !== 'object') return
      const object = value as Record<string, unknown>
      expect(object).not.toHaveProperty('entityId')
      for (const key of ['items', 'records', 'card', 'record', 'transition', 'bundle', 'scope']) check(object[key])
    }
    check(call.reply)
  }
  const frames = suite.frames as Array<{ payload?: Record<string, unknown> }>
  const commitFrames = frames.filter(frame => frame.payload?.transition != null)
  expect(commitFrames.length).toBeGreaterThan(0)
  for (const frame of commitFrames) {
    expect(JSON.stringify(frame)).not.toContain(ENTITY_ID)
    expect(frame.payload).not.toHaveProperty('entityId')
    if (frame.payload?.record != null) expect(frame.payload.record).not.toHaveProperty('entityId')
  }
  expect((await suite.client.planningStores!().assignees.get(actor.id!)).entityId).toBe('')
  expect((await suite.local.assignees.get(actor.id!)).entityId).toBe(ENTITY_ID)
  unsubscribe()
  await suite.client.planning().close()
})
