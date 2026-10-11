import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext, type BasicConfig } from '@owlmeans/context'
import { AssigneeKind, type PlanningService } from '@owlmeans/planning'
import { appendPlanningService, makeMemoryPlanningStore } from '@owlmeans/server-planning'
import { makePlanningAuth, makePlanningAuthPlugin } from '../src/index.js'

const boot = async () => {
  const ctx = appendPlanningService(makeBasicContext<BasicConfig>({ ready: false, service: 'auth-tests', type: AppType.Backend, services: {} }), {
    store: makeMemoryPlanningStore(), plugins: [makePlanningAuthPlugin()],
  })
  await ctx.configure().init()
  return ctx.planning() as PlanningService
}
describe('@owlmeans/planning-auth — optional identity integration', () => {
  test('provider plus subject is stable across nickname and group-name changes', async () => {
    const planning = await boot(), p = planning.for({ entityId: 'organization-1' })
    const auth = makePlanningAuth({ planning: () => p, provider: 'external-oidc' })
    const actor = await auth.assigneeFor({ externalId: 'subject-1', nickname: 'Alice' })
    const again = await auth.assigneeFor({ externalId: 'subject-1', nickname: 'Changed display name' })
    expect(again.id).toBe(actor.id)
    expect(again.kind).toBe(AssigneeKind.Human)
    const collision = await auth.assigneeFor({ externalId: 'subject-2', nickname: 'ALICE' })
    expect(collision.id).not.toBe(actor.id)
    expect(collision.nickname.toLowerCase()).not.toBe('alice')
    const team = await auth.teamFor({ externalId: 'group-1', name: 'Editors' })
    expect((await auth.teamFor({ externalId: 'group-1', name: 'Renamed editors' })).id).toBe(team.id)
    expect(team.externalId).toBe('external-oidc:group-1')
    expect(await p.teams.members(team.id!)).toEqual([])
  })
  test('trusted scope resolves a human reporter and a non-human default assignee per organization', async () => {
    const planning = await boot(), p = planning.for({ entityId: 'organization-1' })
    const adapter = makePlanningAuth({ planning: () => p, defaultAssignee: { externalId: 'agent-runner', nickname: 'agent-runner' } })
    const scope = await adapter.scopeFor({ entityId: 'organization-1', profileId: 'app:user-1', channel: 'web' })
    const reporter = await p.assignees.get(scope.assigneeId!), assignee = await p.assignees.get(scope.defaultAssigneeId!)
    expect(reporter.authentication).toEqual({ provider: 'owlmeans', externalId: 'app:user-1' })
    expect(assignee.kind).toBe(AssigneeKind.NonHuman)
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => adapter.scopeFor(scope)))
    expect(new Set(concurrent.map(row => row.assigneeId)).size).toBe(1)
    const other = makePlanningAuth({ planning: () => planning.for({ entityId: 'organization-2' }), defaultAssignee: { externalId: 'agent-runner', nickname: 'agent-runner' } })
    const separate = await other.scopeFor({ entityId: 'organization-2', profileId: 'app:user-1' })
    expect(separate.assigneeId).not.toBe(scope.assigneeId)
    expect(separate.defaultAssigneeId).not.toBe(scope.defaultAssigneeId)
  })
})
