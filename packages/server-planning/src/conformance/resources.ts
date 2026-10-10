import { idHelper } from '@owlmeans/basic-ids'
import {
  AssigneeKind, FieldsInvalid, mentionHelper, ParentNotFound, PlanningError, PlanningForbidden,
  PlanningResourceKind, PlanningSchemaKind, PLANNING_ASSIGNEE, PLANNING_REPORTER, ProjectMode, RelationshipRefused,
  SchemaInvalid, TransitionAction, WorkcardConflict, WorkcardKind, WorkcardNotFound,
  type PlanningFacade, type Workcard,
} from '@owlmeans/planning'
import { assertHelper } from './assert.js'
import { LIBRARY } from './consts.js'
import { conformanceFixturesOf } from './fixtures.js'
import type { ConformanceCase } from './types.js'

const { same, sameSet, rejects, check } = assertHelper
const organization = () => `resource-conformance-${idHelper.uuid()}`
const human = async (planning: PlanningFacade, nickname = 'reader') => await planning.assignees.create({
  nickname, type: LIBRARY.human, kind: AssigneeKind.Human, authentication: { provider: 'external-oidc', externalId: nickname }, fields: { department: 'Library' },
})
const section = async (planning: PlanningFacade, parent: string, extra: Record<string, unknown> = {}): Promise<Workcard> =>
  (await planning.execute({ action: TransitionAction.Create, card: { kind: WorkcardKind.Card, type: LIBRARY.section, parent, title: 'Section', ...extra } }, { wait: true })).card!

/** Shared durable-resource and hierarchy contract, run unchanged against every stock provider. */
export const resourceConformance: readonly ConformanceCase[] = [
  {
    name: 'assignees use schema-validated fields, stable authentication subjects and scoped nicknames', needs: ['resources'],
    run: async ({ facade }) => {
      const org = organization(), p = facade(org), other = facade(organization())
      await rejects(p.assignees.create({ nickname: 'missing-auth', type: LIBRARY.human, kind: AssigneeKind.Human }), FieldsInvalid, 'human requires authentication by default')
      await rejects(p.assignees.create({ nickname: 'wrong-fields', type: LIBRARY.human, kind: AssigneeKind.Human, authentication: { provider: 'x', externalId: 'x' }, fields: { department: 42 } }), FieldsInvalid, 'assignee schema is enforced')
      const actor = await human(p, 'Alice')
      await rejects(human(p, 'aLiCe'), WorkcardConflict, 'nickname is case insensitive')
      await rejects(p.assignees.create({ nickname: 'another', type: LIBRARY.human, kind: AssigneeKind.Human, authentication: actor.authentication }), WorkcardConflict, 'authentication subject is unique in organization')
      await human(other, 'Alice')
      same(await other.assignees.load(actor.id!), null, 'another organization cannot read assignee')
      const renamed = await p.assignees.update(actor.id!, { nickname: 'Librarian' }, { version: 1 })
      same([renamed.id, renamed.version, renamed.authentication], [actor.id, 2, actor.authentication], 'rename keeps stable identity')
      await rejects(p.assignees.update(actor.id!, { nickname: 'stale' }, { version: 1 }), WorkcardConflict, 'assignee CAS')
      same((await p.assignees.list({ nickname: 'LIBRARIAN' })).items[0].id, actor.id, 'normalized query')
      const bot = await p.assignees.create({ nickname: 'bot', type: LIBRARY.bot, kind: AssigneeKind.NonHuman })
      const guest = await p.assignees.create({ nickname: 'guest', type: LIBRARY.guest, kind: AssigneeKind.Human })
      same([bot.authentication, guest.authentication], [undefined, undefined], 'nonhuman and optional human schemas admit unlinked identities')
      await rejects(p.assignees.create({ nickname: 'mismatch', type: LIBRARY.bot, kind: AssigneeKind.Human }), FieldsInvalid, 'fundamental kind follows schema')
    },
  },
  {
    name: 'concurrent nickname claims create one assignee and leave subsequent writes usable', needs: ['resources'],
    run: async ({ facade }) => {
      const p = facade(organization())
      const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => human(p, 'claimed')))
      same(attempts.filter(row => row.status === 'fulfilled').length, 1, 'one nickname winner')
      same((await p.assignees.list({ nickname: 'CLAIMED' })).total, 1, 'one persisted identity')
      await human(p, 'after-conflict')
      same((await p.assignees.list()).total, 2, 'rejected writes do not poison durable operation journal')
    },
  },
  {
    name: 'comments retain trusted authors and derived mentions follow edits and removal', needs: ['resources'],
    run: async ({ facade, service, store }) => {
      const org = organization(), p = facade(org), actor = await human(p), mentioned = await human(p, 'mentioned')
      const branch = await conformanceFixturesOf(p).createBranch(), card = await conformanceFixturesOf(p).createBook(branch.id!)
      const authored = service.for({ ...p.scope, assigneeId: actor.id })
      await rejects(p.comments.create({ card: card.id!, body: 'no author' }), PlanningForbidden, 'comment requires trusted author')
      const comment = await authored.comments.create({ card: card.id!, body: `${mentionHelper.encode(mentioned.id!, mentioned.nickname)} ${mentionHelper.encode(mentioned.id!, mentioned.nickname)}` })
      same([comment.author, comment.version], [actor.id, 1], 'trusted immutable author')
      const mentions = await authored.mentions.list({ comment: comment.id })
      same(mentions.items.map(row => [row.assignee, row.revision]), [[mentioned.id, 1]], 'stable-id mentions deduplicate')
      // Remove the cache behind the facade; the next reader repairs it from the source revision.
      await store.mentions!.drop(mentions.items[0].id!, org, mentions.items[0].version)
      same((await authored.mentions.list({ comment: comment.id })).total, 1, 'cache self-heals after interrupted cache write')
      const stranger = service.for({ ...p.scope, assigneeId: mentioned.id })
      await rejects(stranger.comments.update(comment.id!, { body: 'taken' }, { version: 1 }), PlanningForbidden, 'another author cannot edit')
      await authored.comments.update(comment.id!, { body: 'no mentions' }, { version: 1 })
      same((await authored.mentions.list({ comment: comment.id })).total, 0, 'removed mention is removed from cache')
      await rejects(authored.comments.update(comment.id!, { body: 'stale' }, { version: 1 }), WorkcardConflict, 'comment CAS')
      await authored.comments.remove(comment.id!, { version: 2 })
      same(await authored.comments.load(comment.id!), null, 'comment removed')
      same((await store.mentions!.list({ entityId: org, comment: comment.id })).total, 0, 'no orphan cache records')
      await rejects(authored.comments.create({ card: card.id!, body: '[@foreign](assignee:missing)' }), WorkcardNotFound, 'mention of unknown assignee is refused')
    },
  },
  {
    name: 'teams are reusable canonical relationships with deduplicated project assignees', needs: ['resources'],
    run: async ({ facade, store }) => {
      const org = organization(), p = facade(org), actor = await human(p), fixtures = conformanceFixturesOf(p)
      const first = await fixtures.createBranch('First'), second = await fixtures.createBranch('Second')
      const a = await p.teams.create({ name: 'Editors', externalId: 'permission-group:editors' }), b = await p.teams.create({ name: 'Reviewers' })
      await p.teams.addMember(a.id!, actor.id!); await p.teams.addMember(a.id!, actor.id!); await p.teams.addMember(b.id!, actor.id!)
      await p.teams.attach(a.id!, first.id!); await p.teams.attach(a.id!, second.id!); await p.teams.attach(b.id!, first.id!)
      sameSet((await p.teams.members(a.id!)).map(row => row.id), [actor.id], 'membership is idempotent')
      sameSet(await p.teams.projects(a.id!), [first.id, second.id], 'one reusable team on two projects')
      same((await p.teams.assignees(first.id!)).map(row => row.id), [actor.id], 'union of team assignees')
      check((await store.links!.list({ entityId: org, from: a.id, fromKind: PlanningResourceKind.Team })).total === 1, 'native relationship store owns membership')
      await rejects(p.teams.remove(a.id!, { version: 1 }), WorkcardConflict, 'attached team cannot be removed')
      await p.teams.detach(a.id!, first.id!); await p.teams.detach(a.id!, second.id!); await p.teams.remove(a.id!, { version: 1 })
      same(await p.teams.load(a.id!), null, 'detached team removed')
      same((await p.assignees.get(actor.id!)).id, actor.id, 'team deletion preserves identity')
      same(await facade(organization()).teams.load(b.id!), null, 'team isolation')
    },
  },
  {
    name: 'card reporter, assignee and schema fields derive indexes and preserve retired references', needs: ['resources'],
    run: async ({ facade, store }) => {
      const org = organization(), p = facade(org), actor = await human(p), bot = await p.assignees.create({ nickname: 'bot', type: LIBRARY.bot, kind: AssigneeKind.NonHuman })
      const branch = await conformanceFixturesOf(p).createBranch()
      const card = await section(p, branch.id!, { reporter: actor.id, assignee: bot.id, fields: { requester: actor.id, reviewers: [actor.id, bot.id] } })
      const edges = await store.links!.list({ entityId: org, from: card.id, toKind: PlanningResourceKind.Assignee }, { size: 0 })
      sameSet(edges.items.map(row => [row.type, row.to]), [[PLANNING_REPORTER, actor.id], [PLANNING_ASSIGNEE, bot.id], ['requested-by', actor.id], ['reviewed-by', actor.id], ['reviewed-by', bot.id]], 'canonical indexes from top-level and typed fields')
      same((await p.relationships.list({ from: actor.id, type: 'requests', fromKind: PlanningResourceKind.Assignee })).items.map(edge => edge.to), [card.id], 'inverse relationship is derived from canonical edge')
      await rejects(section(p, branch.id!, { reporter: 'missing' }), RelationshipRefused, 'unknown assignee reference')
      await rejects(section(p, branch.id!, { fields: { requester: bot.id } }), RelationshipRefused, 'assignee-type relationship restriction')
      await rejects(p.execute({ card: card.id!, action: TransitionAction.Link, link: { type: 'requested-by', to: bot.id! } }), RelationshipRefused, 'field-derived link cannot be independently edited')
      await rejects(p.assignees.update(actor.id!, { type: LIBRARY.guest }, { version: 1 }), FieldsInvalid, 'assignee type change cannot invalidate existing typed references')
      same((await p.assignees.get(actor.id!)).version, 1, 'rejected type change leaves identity unchanged')
      await p.assignees.retire(actor.id!, { version: 1 })
      await p.execute({ card: card.id!, action: TransitionAction.Update, changes: { title: 'Kept after retirement' } }, { wait: true })
      await rejects(section(p, branch.id!, { reporter: actor.id }), RelationshipRefused, 'new references to retired assignee refused')
      await p.execute({ card: card.id!, action: TransitionAction.Update, unset: ['reporter', 'fields.requester', 'fields.reviewers'] }, { wait: true })
      same((await store.links!.list({ entityId: org, from: card.id }, { size: 0 })).items.map(row => row.type), [PLANNING_ASSIGNEE], 'cleared fields remove their derived indexes')
    },
  },
  {
    name: 'purging a former project preserves reparented descendant documents, links and full history', needs: ['resources'],
    run: async ({ facade, store }) => {
      const org = organization(), p = facade(org), fixtures = conformanceFixturesOf(p)
      const old = await fixtures.createBranch('Former'), next = await fixtures.createBranch('Destination')
      const parent = await section(p, old.id!), leaf = await fixtures.createBook(parent.id!)
      const document = (await (await p.model(leaf)).write('summary', '{"lines":["kept"]}', { wait: true })).card!
      await p.execute({ card: leaf.id!, action: TransitionAction.Link, link: { type: 'shelved-near', to: parent.id! } }, { wait: true })
      const history = (await store.transitions!.list({ entityId: org, card: leaf.id }, { size: 0 })).items.map(row => row.id)
      await p.execute({ card: parent.id!, action: TransitionAction.Update, changes: { parent: next.id, parents: [next.id!] } }, { wait: true })
      await p.execute({ card: old.id!, action: TransitionAction.Delete }, { wait: true })
      same((await p.cards.get(leaf.id!)).id, leaf.id, 'reparented descendant survives')
      same((await p.specifications.get(document.id!)).body, '{"lines":["kept"]}', 'descendant document survives stale project cache')
      sameSet((await store.transitions!.list({ entityId: org, card: leaf.id }, { size: 0 })).items.map(row => row.id), history, 'complete history survives former project purge')
      same((await p.relationships.list({ from: leaf.id })).items.length, 1, 'surviving edge kept')
      await (await p.model(leaf.id!)).update({ title: 'Still writable' }, { wait: true })
    },
  },
  {
    name: 'nested hierarchies derive primary parent type, refuse cycles and permit safe reparenting',
    run: async ({ facade }) => {
      const p = facade(organization()), fixtures = conformanceFixturesOf(p)
      const a = await fixtures.createBranch('A'), b = await fixtures.createBranch('B'), parent = await section(p, a.id!), child = await section(p, parent.id!), leaf = await fixtures.createBook(child.id!)
      same([child.parent, child.parentType, child.parents, leaf.parentType], [parent.id, LIBRARY.section, [parent.id], LIBRARY.section], 'primary parent is direct and typed')
      same((await p.model(leaf)).schema().type, LIBRARY.book, 'nested card resolves nearest project schemas')
      await rejects(p.execute({ card: parent.id!, action: TransitionAction.Update, changes: { parent: child.id, parents: [child.id!] } }), PlanningError, 'cycle refused')
      await rejects(p.execute({ card: parent.id!, action: TransitionAction.Delete }), PlanningError, 'live children refuse ordinary deletion')
      await rejects(p.execute({ card: child.id!, action: TransitionAction.Update, changes: { parents: [] }, unset: ['parent'] }), ParentNotFound, 'required primary parent cannot orphan')
      await p.execute({ card: parent.id!, action: TransitionAction.Update, changes: { parent: b.id, parents: [b.id!] } }, { wait: true })
      same((await p.cards.get(parent.id!)).parent, b.id, 'required hierarchy permits safe reparent')
    },
  },
  {
    name: 'recursive project scopes filter nested cards, comments and relationships before pagination', needs: ['resources'],
    run: async ({ facade, service }) => {
      const org = organization(), p = facade(org), fixtures = conformanceFixturesOf(p), actor = await human(p)
      const a = await fixtures.createBranch('Allowed'), b = await fixtures.createBranch('Other'), nest = await section(p, a.id!)
      const visible = await fixtures.createBook(nest.id!), hidden = await fixtures.createBook(b.id!)
      await p.execute({ card: visible.id!, action: TransitionAction.Link, link: { type: 'shelved-near', to: hidden.id! } }, { wait: true })
      const author = service.for({ ...p.scope, assigneeId: actor.id })
      await author.comments.create({ card: visible.id!, body: 'visible' }); await author.comments.create({ card: hidden.id!, body: 'hidden' })
      const narrowed = service.for({ ...p.scope, projects: [a.id!] })
      same((await narrowed.cards.get(visible.id!)).id, visible.id, 'recursive single read')
      same(await narrowed.cards.load(hidden.id!), null, 'outside scope absent')
      const list = await narrowed.cards.list({ size: 1, page: 1 })
      same(list.total, 3, 'recursive total includes project and nested cards')
      same((await narrowed.comments.list({ size: 1 })).total, 1, 'comment total excludes inaccessible cards')
      same((await narrowed.relationships.list({ from: visible.id, size: 1 })).total, 0, 'cross-scope target edge concealed')
    },
  },
  {
    name: 'project modes are validated metadata and project purge removes recursive auxiliaries only', needs: ['resources'],
    run: async ({ facade, service, store }) => {
      const org = organization(), p = facade(org), fixtures = conformanceFixturesOf(p), actor = await human(p)
      const project = await fixtures.createBranch(), nest = await section(p, project.id!), card = await fixtures.createBook(nest.id!)
      same(project.mode, ProjectMode.Opened, 'default open mode')
      await p.execute({ card: project.id!, action: TransitionAction.Update, changes: { mode: ProjectMode.Closed } }, { wait: true })
      same((await p.cards.get(project.id!)).mode, ProjectMode.Closed, 'closed mode persists independently of flow status')
      await rejects(p.execute({ card: card.id!, action: TransitionAction.Update, changes: { mode: ProjectMode.Closed } }), FieldsInvalid, 'mode belongs to projects')
      const team = await p.teams.create({ name: 'Reusable' }); await p.teams.addMember(team.id!, actor.id!); await p.teams.attach(team.id!, project.id!)
      const author = service.for({ ...p.scope, assigneeId: actor.id })
      const comment = await author.comments.create({ card: card.id!, body: mentionHelper.encode(actor.id!, actor.nickname) })
      await p.execute({ card: project.id!, action: TransitionAction.Delete }, { wait: true })
      same(await p.cards.load(card.id!), null, 'recursive child purged')
      same(await p.comments.load(comment.id!), null, 'comment purged')
      same((await store.mentions!.list({ entityId: org, comment: comment.id })).total, 0, 'mention purged')
      same((await p.teams.get(team.id!)).id, team.id, 'organization team survives project purge')
      same((await p.assignees.get(actor.id!)).id, actor.id, 'organization assignee survives project purge')
      same(await p.teams.projects(team.id!), [], 'project-team edge purged')
    },
  },
  {
    name: 'data-defined assignee schemas are organization-only, validated and revisioned', needs: ['schemas', 'resources'],
    run: async ({ facade, service }) => {
      const p = facade(organization()), defs = p.definitions!, type = `agent:${idHelper.uuid()}`
      const schema = { type, version: 1, kind: AssigneeKind.NonHuman, fields: { type: 'object', properties: { model: { type: 'string' } }, required: ['model'], additionalProperties: false } }
      await defs.putAssigneeType(schema)
      await rejects(p.assignees.create({ nickname: 'agent', type, kind: AssigneeKind.NonHuman }), FieldsInvalid, 'data-defined fields enforced')
      const actor = await p.assignees.create({ nickname: 'agent', type, kind: AssigneeKind.NonHuman, fields: { model: 'runner' } })
      const bundle = await defs.bundle()
      check(bundle.assigneeTypes?.some(row => row.type === type) === true, 'assignee definition roundtrips')
      const root = await conformanceFixturesOf(p).createBranch('Schema root')
      const nested = (await p.execute({ action: TransitionAction.Create, card: { kind: WorkcardKind.Project, type: LIBRARY.branch, title: 'Nested schema project', parent: root.id! } }, { wait: true })).card!
      const nestedType = `${type}:nested-card`
      await defs.putType({ type: nestedType, version: 1, kind: WorkcardKind.Card, fields: { type: 'object' }, flows: [LIBRARY.circulation], specifications: [] }, { project: nested.id })
      const scoped = service.for({ ...p.scope, projects: [root.id!] })
      check((await scoped.definitions!.records({ project: nested.id })).some(record => record.key === nestedType), 'ancestor project scope includes descendant schema records')
      await rejects(defs.putAssigneeType({ ...schema, version: 2, fields: { type: 'invalid-json-schema' } }), SchemaInvalid, 'invalid assignee schema refused')
      await defs.retire(PlanningSchemaKind.AssigneeType, type)
      await rejects(p.assignees.create({ nickname: 'new-agent', type, kind: AssigneeKind.NonHuman, fields: actor.fields }), FieldsInvalid, 'retired type refuses new identities')
      same((await p.assignees.get(actor.id!)).id, actor.id, 'retirement keeps identity readable')
    },
  },
]
