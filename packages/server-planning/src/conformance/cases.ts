import { resourceConformance } from './resources.js'

import { applyHelper, CardTypeNotAllowed, CommitState, IntrinsicStatus, PlanningError, PlanningSchemaKind, RelationshipRefused, SchemaConflict, SchemaInUse, SchemaInvalid, SchemaOrigin, SchemaSealed, SpecificationFormat, TransitionAction, UnknownWorkcardType, WorkcardConflict, WorkcardKind, WorkcardNotFound, type CommitEvent, type PlanningFacade, type PlanningStore, type StatusFlowSchema, type Transition, type TransitionExecution, type Unsubscribe, type Workcard, type WorkcardQuery, type WorkcardTypeSchema } from '@owlmeans/planning'
import { creatorHelper } from '../executor/creator.js'
import { assertHelper } from './assert.js'
import { conformanceFixturesOf } from './fixtures.js'
import { BOOK_TYPE, LIBRARY, PERIODICAL_TYPE } from './consts.js'
import type { ConformanceCase } from './types.js'
import { idHelper } from '@owlmeans/basic-ids'

const { check, rejects, same, sameSet } = assertHelper

/** A fresh organization per case, so cases never see each other's cards on a shared database. */
const organization = (): string => `conformance-${idHelper.uuid()}`

const ids = async (planning: PlanningFacade, query: WorkcardQuery): Promise<string[]> =>
  (await planning.cards.list({ ...query, size: 0 })).items.map(card => card.id!)

const execute = async (
  planning: PlanningFacade, exec: Parameters<PlanningFacade['execute']>[0]
): Promise<Workcard | null> => (await planning.execute(exec, { wait: true })).card ?? null

const cases: ConformanceCase[] = [
  {
    name: 'folds transitions in seq order and settles each one once',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const events: CommitEvent[] = []
      const unsubscribe: Unsubscribe = await planning.commits.subscribe(event => { events.push(event) })
      try {
        const branch = await fixtures.createBranch()
        const book = await fixtures.createBook(branch.id!, 'Winter poems')
        await execute(planning, { card: book.id!, action: TransitionAction.Update, changes: { title: 'Winter verses' } })
        await fixtures.transit(book.id!, 'lend')

        const card = await planning.cards.get(book.id!)
        same([card.seq, card.head, card.title, card.status, card.intrinsic], [3, 3, 'Winter verses', 'lent', IntrinsicStatus.InProgress], 'the folded card')
        same(events.filter(event => event.card === book.id).map(event => [event.seq, event.state]),
          [[1, CommitState.Committed], [2, CommitState.Committed], [3, CommitState.Committed]], 'one committed event per transition')
      } finally {
        unsubscribe()
      }
    },
  },

  {
    name: 'allocates seq against the head and refuses a stale expectSeq',
    run: async ({ facade, store }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const book = await fixtures.createBook((await fixtures.createBranch()).id!)

      await execute(planning, { card: book.id!, action: TransitionAction.Update, changes: { title: 'First' }, expectSeq: 1 })
      await rejects(planning.execute({ card: book.id!, action: TransitionAction.Update, changes: { title: 'Stale' }, expectSeq: 1 }),
        WorkcardConflict, 'a stale expectSeq')
      same(await store.transitions!.head(book.id!), 2, 'the head after two transitions')
      same(await store.transitions!.nextSeq(`conformance-${idHelper.uuid()}`, null), 1, 'a card with no log allocates 1')
      same((await planning.cards.get(book.id!)).title, 'First', 'the refused write left the card alone')
    },
  },

  {
    name: 'an idempotency key answers its first receipt',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const book = await fixtures.createBook((await fixtures.createBranch()).id!)

      const first = await planning.execute({ card: book.id!, action: TransitionAction.Update, changes: { title: 'Kept' }, key: 'import:1' }, { wait: true })
      const again = await planning.execute({ card: book.id!, action: TransitionAction.Update, changes: { title: 'Lost' }, key: 'import:1' }, { wait: true })

      same(again.transition.id, first.transition.id, 'the retried key answers the first transition')
      const card = await planning.cards.get(book.id!)
      same([card.title, card.seq], ['Kept', 2], 'one write landed')
    },
  },

  {
    name: 'keeps a create\'s createdBy — the scope\'s subject, or the one the caller named — through later writes',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const subject = creatorHelper.creatorOf(planning.scope)
      check(subject != null, 'the conformance facade acts as a signed-in person')

      const branch = await fixtures.createBranch()
      const stamped = await fixtures.createBook(branch.id!, 'Stamped')
      const named = await fixtures.createBook(branch.id!, 'Named', { createdBy: 'conformance-donor' })
      await execute(planning, { card: stamped.id!, action: TransitionAction.Update, changes: { title: 'Stamped, revised' } })
      await fixtures.transit(stamped.id!, 'lend')

      same([branch.createdBy, (await planning.cards.get(stamped.id!)).createdBy, (await planning.cards.get(named.id!)).createdBy],
        [subject, subject, 'conformance-donor'], 'createdBy read back after later writes')
      sameSet((await planning.cards.list({ parent: branch.id, size: 0 })).items.map(card => [card.title, card.createdBy]),
        [['Stamped, revised', subject], ['Named', 'conformance-donor']], 'createdBy in a list')
    },
  },

  {
    name: 'refuses a write that moves createdBy, and folds a legacy row that named it',
    run: async ({ facade, store }) => {
      const org = organization()
      const planning = facade(org)
      const fixtures = conformanceFixturesOf(planning)
      const branch = await fixtures.createBranch()
      const book = await fixtures.createBook(branch.id!, 'Owned')
      const moves: TransitionExecution[] = [
        { card: book.id!, action: TransitionAction.Update, changes: { title: 'Taken', createdBy: 'conformance-intruder' } },
        { card: book.id!, action: TransitionAction.Update, unset: ['createdBy'] },
      ]

      for (const exec of moves) {
        const error = await rejects(planning.execute(exec, { wait: true }), PlanningError, 'a write naming createdBy')
        check(error.message.includes('immutable:createdBy'), `refused as immutable, not ${error.message}`)
      }
      const kept = await planning.cards.get(book.id!)
      same([kept.createdBy, kept.title, kept.seq, (await planning.transitions.list({ card: book.id! })).total],
        [creatorHelper.creatorOf(planning.scope), 'Owned', 1, 1], 'the refused writes left the card and its log alone')

      // Rows appended before the refusal existed: the store folds them exactly as the pure fold does.
      const legacy: Transition[] = []
      for (const patch of [{ changes: { title: 'Legacy', createdBy: 'conformance-intruder' } }, { changes: {}, unset: ['createdBy'] }]) {
        const seq = await store.transitions!.nextSeq(book.id!, null)
        legacy.push(await store.transitions!.append({
          entityId: org, card: book.id!, kind: WorkcardKind.Card, type: LIBRARY.book, project: branch.id!, seq,
          action: TransitionAction.Update, actor: {}, at: `2001-01-01T00:00:0${seq}.000Z`,
          commit: { state: CommitState.Pending }, ...patch,
        }))
      }
      await store.cards.project(book.id!)

      for (const row of legacy) {
        same((await planning.commits.status(row.id!)).state, CommitState.Committed, `legacy row ${row.seq} settles committed`)
      }
      const expected = legacy.reduce<Workcard | null>((card, row) => applyHelper.applyTransition(card, row), kept)!
      const folded = await planning.cards.get(book.id!)
      same([folded.title, folded.seq, folded.createdBy], [expected.title, expected.seq, expected.createdBy], 'the legacy rows folded')
      await execute(planning, { card: book.id!, action: TransitionAction.Update, changes: { title: 'After' } })
      same((await planning.cards.get(book.id!)).title, 'After', 'the next write commits past them')
    },
  },

  {
    name: 'transit moves the intrinsic state and closedAt, and a second flow leaves the primary alone',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const book = await fixtures.createBook((await fixtures.createBranch()).id!)

      await fixtures.transit(book.id!, 'retire')
      const retired = await planning.cards.get(book.id!)
      same([retired.status, retired.intrinsic], ['retired', IntrinsicStatus.Closed], 'retired')
      check(typeof retired.closedAt === 'string', 'closedAt is set on entering closed')

      await fixtures.transit(book.id!, 'restore')
      const restored = await planning.cards.get(book.id!)
      same([restored.status, restored.intrinsic, restored.closedAt], ['shelved', IntrinsicStatus.Planned, undefined], 'closedAt cleared on leaving closed')

      await fixtures.transit(book.id!, 'review', { flow: LIBRARY.review })
      const reviewed = await planning.cards.get(book.id!)
      same([reviewed.status, reviewed.flows[LIBRARY.review], reviewed.intrinsic], ['shelved', 'reviewed', IntrinsicStatus.Planned], 'the second flow moved alone')
    },
  },

  {
    name: 'answers the query operators criteriaOf produces',
    run: async ({ facade }) => {
      const org = organization()
      const planning = facade(org)
      const fixtures = conformanceFixturesOf(planning)
      const east = await fixtures.createBranch('East branch')
      const west = await fixtures.createBranch('West branch')
      const poems = await fixtures.createBook(east.id!, 'Winter poems', { labels: ['rare'], fields: { genre: 'poetry', signed: true } })
      const atlas = await fixtures.createBook(east.id!, 'River atlas', { labels: ['new'], parents: [west.id!], fields: { genre: 'history' } })
      const harbour = await fixtures.createBook(east.id!, 'Quiet harbour', { fields: { genre: 'fiction', signed: false } })
      await fixtures.transit(atlas.id!, 'lend')
      const since = (await planning.cards.get(atlas.id!)).updatedAt!

      sameSet(await ids(planning, { within: west.id }), [atlas.id], 'within')
      sameSet(await ids(planning, { parent: east.id, flow: { id: LIBRARY.circulation, status: ['lent', 'retired'] } }), [atlas.id], 'a multi-value flow status')
      sameSet(await ids(planning, { parent: east.id, flow: { id: LIBRARY.circulation, status: 'shelved' } }), [poems.id, harbour.id], 'one flow status')
      sameSet(await ids(planning, { parent: east.id, fields: { genre: 'poetry' } }), [poems.id], 'a string field')
      sameSet(await ids(planning, { parent: east.id, fields: { signed: false } }), [harbour.id], 'a boolean field')
      sameSet(await ids(planning, { parent: east.id, labels: ['rare', 'signed'] }), [poems.id], 'labels overlap')
      sameSet(await ids(planning, { parent: east.id, q: 'HARBOUR' }), [harbour.id], 'text search ignores case')
      sameSet(await ids(planning, { parent: east.id, q: poems.code! }), [poems.id], 'text search by code prefix')
      sameSet(await ids(planning, { parent: east.id, q: '100%_' }), [], 'wildcards in a search are literal')
      sameSet(await ids(planning, { parent: null as never, ids: [east.id!, poems.id!] }), [east.id], 'parent: null is a root')
      sameSet(await ids(planning, { kind: [WorkcardKind.Project], ids: [east.id!, west.id!, poems.id!] }), [east.id, west.id], 'kind and ids')
      sameSet(await ids(planning, { parent: east.id, status: ['shelved'] }), [poems.id, harbour.id], 'status')
      sameSet(await ids(planning, { parent: east.id, intrinsic: IntrinsicStatus.InProgress }), [atlas.id], 'intrinsic')
      sameSet(await ids(planning, { parent: east.id, type: [LIBRARY.book, LIBRARY.periodical] }), [poems.id, atlas.id, harbour.id], 'type')
      sameSet(await ids(planning, { parent: east.id, updatedSince: since }), [atlas.id], 'updatedSince')
      same((await facade(organization()).cards.list({ labels: ['rare'] })).total, 0, 'another organization sees nothing')
    },
  },

  {
    name: 'lists specifications only when the query asks for them',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const branch = await fixtures.createBranch()
      const book = await fixtures.createBook(branch.id!)
      const model = await planning.model(book)
      const summary = (await model.write('summary', '{"lines":["a"]}', { wait: true })).card!
      const charter = (await (await planning.model(branch)).write('charter', '# Charter', { wait: true })).card!

      same(await ids(planning, { parent: book.id }), [], 'a card list leaves specifications out')
      sameSet(await ids(planning, { parent: book.id, kind: WorkcardKind.Specification }), [summary.id], 'kind: specification')
      sameSet(await ids(planning, { parent: book.id, category: 'summary' }), [summary.id], 'a category')
      sameSet(await ids(planning, { within: branch.id }), [book.id], 'within leaves the charter out')
      same(await planning.cards.count({ within: branch.id }), 1, 'count routes the same way')
      sameSet(await ids(planning, { within: branch.id, kind: [WorkcardKind.Card, WorkcardKind.Specification] }), [book.id, charter.id], 'both kinds when asked')
    },
  },

  {
    name: 'pages and sorts a list, counting the whole match',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const branch = await fixtures.createBranch()
      for (const order of [5, 3, 1, 4, 2]) {
        await fixtures.createBook(branch.id!, `Volume ${order}`, { order })
      }

      const page = await planning.cards.list({ parent: branch.id, sort: ['order'], size: 2, page: 1 })
      same([page.total, page.page, page.size, page.items.map(card => card.order)], [5, 1, 2, [3, 4]], 'the second page')
      const all = await planning.cards.list({ parent: branch.id, sort: [{ field: 'order', order: 'desc' }], size: 0 })
      same(all.items.map(card => card.order), [5, 4, 3, 2, 1], 'unpaged, descending')
      same(all.total, 5, 'the total')
    },
  },

  {
    name: 'summarizes direct children by intrinsic state',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const branch = await fixtures.createBranch()
      const empty = await fixtures.createBranch('Empty branch')
      const lent = await fixtures.createBook(branch.id!, 'Lent')
      const retired = await fixtures.createBook(branch.id!, 'Retired')
      await fixtures.createBook(branch.id!, 'Shelved')
      await fixtures.transit(lent.id!, 'lend')
      await fixtures.transit(retired.id!, 'retire')
      const annex = await fixtures.createBranch('Annex', { parent: branch.id })
      await fixtures.createBook(annex.id!, 'Deeper')
      await (await planning.model(branch)).write('charter', '# Charter', { wait: true })

      const summary = await planning.cards.summary([branch.id!, empty.id!])
      same(summary, {
        [branch.id!]: { total: 4, [IntrinsicStatus.Planned]: 2, [IntrinsicStatus.InProgress]: 1, [IntrinsicStatus.Closed]: 1 },
      }, 'direct children only, no specifications, no key for an empty parent')
      same((await planning.cards.summary([branch.id!], { kind: WorkcardKind.Card }))[branch.id!]?.total, 3, 'narrowed by kind')
    },
  },

  {
    name: 'answers a specification current, listed, every document and its revisions',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const branch = await fixtures.createBranch()
      const book = await fixtures.createBook(branch.id!)
      const model = await planning.model(book)
      await model.write('summary', '{"lines":["first"]}', { wait: true })
      await (await planning.model(book.id!)).write('summary', '{"lines":["second"]}', { wait: true })

      const current = await planning.specifications.current(book.id!, 'summary')
      same([current?.revision, current?.body], [2, '{"lines":["second"]}'], 'the current document, revised in place')
      const history = await planning.specifications.revisions(current!.id!)
      same(history.map(entry => [entry.revision, entry.body]), [[2, '{"lines":["second"]}'], [1, '{"lines":["first"]}']], 'revisions newest first')
      same((await planning.specifications.list(book.id!)).items.map(spec => spec.id), [current!.id], 'the list')

      for (const title of ['First note', 'Second note']) {
        await execute(planning, {
          card: { kind: WorkcardKind.Specification, type: LIBRARY.page, parent: branch.id!, title, category: 'notes', format: SpecificationFormat.Markdown, body: title },
          action: TransitionAction.Create,
        })
      }
      same((await planning.specifications.list(branch.id!, { category: 'notes' })).total, 1, 'the current one per category')
      same((await planning.specifications.list(branch.id!, { category: 'notes', all: true })).total, 2, 'every document with all')
    },
  },

  {
    name: 'keeps links: both ends, the single constraint, unlink and a delete dropping edges',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const branch = await fixtures.createBranch()
      const first = await fixtures.createBook(branch.id!, 'First')
      const second = await fixtures.createBook(branch.id!, 'Second')
      const third = await fixtures.createBook(branch.id!, 'Third')

      await execute(planning, { card: second.id!, action: TransitionAction.Link, link: { type: 'sequel-of', to: first.id! } })
      same((await planning.relationships.list({ from: second.id })).total, 1, 'from')
      same((await planning.relationships.list({ to: first.id, type: 'sequel-of' })).items.map(link => link.from), [second.id], 'to and type')
      await rejects(planning.execute({ card: second.id!, action: TransitionAction.Link, link: { type: 'sequel-of', to: third.id! } }),
        RelationshipRefused, 'a second single edge')

      await execute(planning, { card: third.id!, action: TransitionAction.Link, link: { type: 'shelved-near', to: first.id! } })
      await execute(planning, { card: second.id!, action: TransitionAction.Link, link: { type: 'shelved-near', to: first.id! } })
      await execute(planning, { card: third.id!, action: TransitionAction.Unlink, link: { type: 'shelved-near', to: first.id! } })
      sameSet((await planning.relationships.list({ to: first.id, type: 'shelved-near' })).items.map(link => link.from), [second.id], 'unlink')

      await execute(planning, { card: first.id!, action: TransitionAction.Delete })
      same((await planning.relationships.list({ to: first.id })).total, 0, 'a delete drops the edges into the card')
      same((await planning.relationships.list({ from: second.id })).total, 0, 'and out of the cards pointing at it')
    },
  },

  {
    name: 'isolates organizations on every read and write',
    run: async ({ facade }) => {
      const mine = facade(organization())
      const fixtures = conformanceFixturesOf(mine)
      const theirs = facade(organization())
      const branch = await fixtures.createBranch()
      const book = await fixtures.createBook(branch.id!)
      const receipt = await mine.execute({ card: book.id!, action: TransitionAction.Update, changes: { title: 'Mine' } }, { wait: true })

      same(await theirs.cards.load(book.id!), null, 'load')
      await rejects(theirs.cards.get(book.id!), WorkcardNotFound, 'get')
      same((await theirs.cards.list({ within: branch.id })).total, 0, 'list')
      same(await theirs.cards.summary([branch.id!]), {}, 'summary')
      await rejects(theirs.execute({ card: book.id!, action: TransitionAction.Update, changes: { title: 'Theirs' } }), WorkcardNotFound, 'a write')
      await rejects(theirs.transitions.get(receipt.transition.id!), WorkcardNotFound, 'a transition')
      await rejects(theirs.commits.status(receipt.transition.id!), WorkcardNotFound, 'a commit')
      same((await theirs.relationships.list({ from: book.id })).total, 0, 'links')
      same((await mine.cards.get(book.id!)).title, 'Mine', 'nothing moved')
    },
  },

  {
    name: 'purges everything under a deleted project, keeping at most its own delete as a tombstone',
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const doomed = await fixtures.createBranch('Doomed branch')
      const kept = await fixtures.createBranch('Kept branch')
      const first = await fixtures.createBook(doomed.id!, 'First')
      const second = await fixtures.createBook(doomed.id!, 'Second')
      await execute(planning, { card: second.id!, action: TransitionAction.Link, link: { type: 'sequel-of', to: first.id! } })
      const summary = (await (await planning.model(first)).write('summary', '{}', { wait: true })).card!
      const annex = await fixtures.createBranch('Annex', { parent: doomed.id })
      const deeper = await fixtures.createBook(annex.id!, 'Deeper')
      const survivor = await fixtures.createBook(kept.id!, 'Survivor')

      const deleted = await planning.execute({ card: doomed.id!, action: TransitionAction.Delete }, { wait: true })

      for (const id of [doomed.id!, first.id!, second.id!, summary.id!, annex.id!, deeper.id!]) {
        same(await planning.cards.load(id), null, `purged ${id}`)
      }
      same((await planning.relationships.list({ from: second.id })).total, 0, 'links')
      same((await planning.transitions.list({ card: first.id! })).total, 0, 'a child\'s log')
      const left = (await planning.transitions.list({ project: doomed.id!, size: 0 })).items
      check(left.every(row => row.card === doomed.id && row.action === TransitionAction.Delete), 'only the project\'s own delete may remain')
      same((await planning.commits.status(deleted.transition.id!)).state, CommitState.Committed, 'the delete reads committed')
      check(await planning.cards.load(survivor.id!) != null, 'a sibling project survives')
      same((await planning.cards.list({ within: kept.id })).total, 1, 'with its card')
    },
  },

  {
    name: 'settles a transition that cannot fold in order and folds past it',
    run: async ({ facade, store }) => {
      const org = organization()
      const planning = facade(org)
      const fixtures = conformanceFixturesOf(planning)
      const book = await fixtures.createBook((await fixtures.createBranch()).id!)
      // A row two past the card with nothing between — its allocation lost long ago.
      const rogue = await store.transitions!.append({
        entityId: org, card: book.id!, kind: WorkcardKind.Card, type: LIBRARY.book, seq: 3,
        action: TransitionAction.Update, changes: { title: 'Out of order' }, actor: {},
        at: '2001-01-01T00:00:00.000Z', commit: { state: CommitState.Pending },
      })
      await store.cards.project(book.id!)

      check((await planning.commits.status(rogue.id!)).state !== CommitState.Pending, 'the out-of-order row is settled, not left pending')
      await execute(planning, { card: book.id!, action: TransitionAction.Update, changes: { title: 'After' } })
      const card = await planning.cards.get(book.id!)
      same([card.title, card.seq, card.head], ['After', 4, 4], 'the next write commits past it')
    },
  },

  // ─── Data-defined types and flows ─────────────────────────────────────────────────────────────

  {
    name: 'defines a card type as data and admits it where the project allows data-defined types',
    needs: ['schemas'],
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const pamphlets: StatusFlowSchema = {
        id: 'library:pamphlet-life', version: 1,
        statuses: [{ key: 'stacked', intrinsic: IntrinsicStatus.Planned, initial: true }, { key: 'taken', intrinsic: IntrinsicStatus.Closed }],
        transitions: [{ name: 'take', from: ['stacked'], to: 'taken', explicit: true }],
      }
      const pamphlet: WorkcardTypeSchema = {
        type: 'library:pamphlet', kind: WorkcardKind.Card, version: 1, fields: { type: 'object' }, flows: [pamphlets.id], specifications: [],
      }
      const written = await planning.definitions!.define({ flows: [pamphlets], types: [pamphlet] })
      same(written.map(record => [record.kind, record.key, record.version]),
        [[PlanningSchemaKind.Flow, pamphlets.id, 1], [PlanningSchemaKind.Type, pamphlet.type, 1]], 'flows first, then types')

      const branch = await fixtures.createBranch()
      const card = await execute(planning, { card: { kind: WorkcardKind.Card, type: pamphlet.type, parent: branch.id!, title: 'Opening hours' }, action: TransitionAction.Create })
      same([card?.status, card?.intrinsic], ['stacked', IntrinsicStatus.Planned], 'the data-defined flow started it')
      same((await planning.model(card!)).available().map(rule => rule.name), ['take'], 'the model reads the layer')
      await fixtures.transit(card!.id!, 'take')

      const room = await execute(planning, { card: { kind: WorkcardKind.Project, type: LIBRARY.room, title: 'Reading room' }, action: TransitionAction.Create })
      await rejects(planning.execute({ card: { kind: WorkcardKind.Card, type: pamphlet.type, parent: room!.id!, title: 'Refused' }, action: TransitionAction.Create }),
        CardTypeNotAllowed, 'a project without scopedCardTypes')

      const bundle = await planning.definitions!.bundle()
      same([bundle.origins?.types[pamphlet.type], bundle.origins?.types[LIBRARY.book]], [SchemaOrigin.Entity, SchemaOrigin.Code], 'origins')
      same((await facade(organization()).definitions!.bundle()).types.some(type => type.type === pamphlet.type), false, 'another organization does not see it')
    },
  },

  {
    name: 'overrides an overridable code type for the organization, and a project overrides that',
    needs: ['schemas'],
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const branch = await fixtures.createBranch()
      const other = await fixtures.createBranch('Other branch')
      await planning.definitions!.define({ types: [{ ...PERIODICAL_TYPE, label: 'Magazine' }] })
      await planning.definitions!.define({ types: [{ ...PERIODICAL_TYPE, label: 'Zine' }] }, { project: branch.id })

      const labelOf = async (project?: string) =>
        (await planning.definitions!.registry(project)).type(LIBRARY.periodical).label
      same([await labelOf(), await labelOf(branch.id), await labelOf(other.id)], ['Magazine', 'Zine', 'Magazine'], 'layered labels')
      same((await planning.definitions!.registry(branch.id)).originOf(PlanningSchemaKind.Type, LIBRARY.periodical), SchemaOrigin.Project, 'project origin')

      const card = await execute(planning, { card: { kind: WorkcardKind.Card, type: LIBRARY.periodical, parent: branch.id!, title: 'Weekly' }, action: TransitionAction.Create })
      same((await planning.model(card!)).schema().label, 'Zine', 'a card reads its own project\'s layer')
      same((await planning.definitions!.records({ project: branch.id })).map(record => record.key), [LIBRARY.periodical], 'the project layer\'s records')
    },
  },

  {
    name: 'refuses a sealed key, a non-card type and a lost compare-and-set',
    needs: ['schemas'],
    run: async ({ facade }) => {
      const definitions = facade(organization()).definitions!
      await rejects(definitions.putType({ ...BOOK_TYPE, label: 'Renamed' }), SchemaSealed, 'a sealed code type')
      await rejects(definitions.define({ flows: [{ id: LIBRARY.circulation, version: 1, statuses: [{ key: 'x', intrinsic: IntrinsicStatus.Planned }], transitions: [] }] }),
        SchemaSealed, 'a sealed code flow')
      await rejects(definitions.putType({ ...BOOK_TYPE, type: 'library:archive', kind: WorkcardKind.Specification }), SchemaInvalid, 'a specification type as data')
      await rejects(definitions.putType({ ...BOOK_TYPE, type: 'library:atlas', flows: ['library:nowhere'] }), SchemaInvalid, 'a flow that does not resolve')

      const atlas: WorkcardTypeSchema = { ...BOOK_TYPE, type: 'library:atlas', code: undefined, relationships: undefined }
      await definitions.putType(atlas)
      await rejects(definitions.putType(atlas), SchemaConflict, 'version 1 twice')
      await rejects(definitions.putType({ ...atlas, version: 3 }), SchemaConflict, 'a skipped version')
      same((await definitions.putType({ ...atlas, version: 2, label: 'Atlas' })).version, 2, 'the next version')
      same((await definitions.seed({ types: [{ ...atlas, label: 'Seeded' }] })).length, 0, 'seed adds nothing the layer has')
      same((await definitions.registry()).type('library:atlas').label, 'Atlas', 'seed left it alone')
    },
  },

  {
    name: 'retires without breaking existing cards and refuses a flow still in use',
    needs: ['schemas'],
    run: async ({ facade }) => {
      const planning = facade(organization())
      const fixtures = conformanceFixturesOf(planning)
      const definitions = planning.definitions!
      const repair: StatusFlowSchema = {
        id: 'library:repair', version: 1,
        statuses: [
          { key: 'queued', intrinsic: IntrinsicStatus.Planned, initial: true },
          { key: 'mending', intrinsic: IntrinsicStatus.InProgress },
          { key: 'done', intrinsic: IntrinsicStatus.Closed },
        ],
        transitions: [{ name: 'mend', from: ['queued'], to: 'mending' }, { name: 'finish', from: ['mending'], to: 'done' }],
      }
      const folio: WorkcardTypeSchema = {
        type: 'library:folio', kind: WorkcardKind.Card, version: 1, fields: { type: 'object' }, flows: [repair.id], specifications: [],
      }
      await definitions.define({ flows: [repair], types: [folio] })
      const branch = await fixtures.createBranch()
      const card = await execute(planning, { card: { kind: WorkcardKind.Card, type: folio.type, parent: branch.id!, title: 'Old map' }, action: TransitionAction.Create })
      await fixtures.transit(card!.id!, 'mend')

      await rejects(definitions.retire(PlanningSchemaKind.Flow, repair.id), SchemaInUse, 'a flow a live type runs')

      // The flow changes under the card: `mending` is no longer declared, and the card still moves.
      await definitions.define({ flows: [{ ...repair, statuses: [repair.statuses[0], repair.statuses[2]], transitions: [{ name: 'finish', from: ['queued'], to: 'done' }] }] })
      await fixtures.transit(card!.id!, 'finish')
      same((await planning.cards.get(card!.id!)).status, 'done', 'an undeclared status follows the rule of the name')

      await definitions.retire(PlanningSchemaKind.Type, folio.type)
      await rejects(planning.execute({ card: { kind: WorkcardKind.Card, type: folio.type, parent: branch.id!, title: 'New map' }, action: TransitionAction.Create }),
        UnknownWorkcardType, 'nothing new of a retired type')
      await execute(planning, { card: card!.id!, action: TransitionAction.Update, changes: { title: 'Old map, mended' } })
      same((await planning.cards.get(card!.id!)).title, 'Old map, mended', 'an existing card still writes')

      same((await definitions.retire(PlanningSchemaKind.Flow, repair.id)).retired, true, 'the flow retires once no live type runs it')
      same((await definitions.bundle()).retired, { types: [folio.type], flows: [repair.id] }, 'both listed retired')
    },
  },

  {
    name: 'moves the revision on every write and resolves the next read from it',
    needs: ['schemas'],
    run: async ({ facade, store }) => {
      const org = organization()
      const definitions = facade(org).definitions!
      const heard: string[] = []
      const unwatch = store.schemas!.watch?.(entityId => { heard.push(entityId) })
      try {
        const before = await store.schemas!.revision(org)
        await definitions.define({ types: [{ ...PERIODICAL_TYPE, label: 'Journal' }] })
        const after = await store.schemas!.revision(org)
        check(after > before, 'a write moves the revision')
        same((await definitions.bundle()).revision, after, 'the bundle names its revision')
        same((await definitions.registry()).type(LIBRARY.periodical).label, 'Journal', 'the first read')

        await definitions.define({ types: [{ ...PERIODICAL_TYPE, label: 'Gazette' }] })
        same((await definitions.registry()).type(LIBRARY.periodical).label, 'Gazette', 'a cached layer is never served stale')
        if (unwatch != null) {
          check(heard.includes(org), 'a watcher hears the write')
        }
      } finally {
        unwatch?.()
      }
    },
  },
]

/** Every conformance case, in order. */
export const planningConformance: readonly ConformanceCase[] = Object.freeze([...cases, ...resourceConformance])

/** The cases a store qualifies for — a case needing `schemas` only where the store holds them. */
export const conformanceCasesFor = (store: PlanningStore): ConformanceCase[] =>
  planningConformance.filter(entry => (entry.needs ?? []).every(need => need === 'schemas' ? store.schemas != null : store.assignees != null && store.teams != null && store.comments != null && store.mentions != null))
