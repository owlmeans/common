import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { ResilientError } from '@owlmeans/error'
import { CodeScope, CodeStyle, IntrinsicStatus, makeSchemaRegistry, SpecificationFormat, TITLE_MAX, WorkcardKind, type Specification, statusHelper } from '@owlmeans/planning'
import { ProjectArea } from '../src/areas/consts.js'
import { BOT_PLATFORMS_MAX } from '../src/stack/consts.js'
import { ConnectingUserStoryKind, REQUIREMENTS_VERSION, SpecCategory, UserStoryKind } from '../src/ba/consts.js'
import { RequirementsDocumentSchema } from '../src/ba/schemas.js'
import { connectingUserStoryHelper } from '../src/ba/connecting.js'
import { WORKCARD_DESIGN_VERSION, WorkcardActor } from '../src/design/consts.js'
import { workcardDesignHelper } from '../src/design/workcard.js'
import type { WorkcardDesign } from '../src/design/types.js'
import { LANDING_USER_STORY_SENTENCE, landingSentenceHelper } from '../src/index.js'
import { ProjectAgentOccupied, ProjectNotFound, ProjectWorkcardMissconfigured, VIABLE_FLOW_SCHEMAS, VIABLE_PROJECT_FLOW, VIABLE_PROJECT_FLOW_SCHEMA, VIABLE_PROJECT_TYPE, VIABLE_PROJECT_TYPE_SCHEMA, VIABLE_RESERVED_TYPE_SCHEMAS, VIABLE_SPEC_TYPE, VIABLE_WORKCARD_FLOW, VIABLE_WORKCARD_FLOW_SCHEMA, VIABLE_USER_STORY_TYPE, VIABLE_USER_STORY_TYPE_SCHEMA, VIABLE_TYPE_SCHEMAS, VIABLE_WORK_TYPES, ViableChannel, ViableProjectFieldsSchema, ViableProjectStatus, ViableProjectTransition, ViableRelationship, ViableSpecCategory, ViableWorkcardFieldsSchema, ViableWorkcardStatus, ViableWorkcardTransition, type ViableProjectCard, type ViableWorkcard, viableCardHelper, viableSpecHelper } from '../src/planning/index.js'

const at = '2026-09-16T10:00:00.000Z'

const workcardRecord = (extra: Partial<ViableWorkcard> = {}): ViableWorkcard => ({
  id: 'story-card',
  kind: WorkcardKind.Card,
  type: VIABLE_USER_STORY_TYPE,
  entityId: 'entity',
  code: 'US-ABC12',
  title: 'A member books a slot.',
  parent: 'project-card',
  parents: ['project-card'],
  status: ViableWorkcardStatus.Planned,
  intrinsic: IntrinsicStatus.Planned,
  flows: { [VIABLE_WORKCARD_FLOW]: ViableWorkcardStatus.Planned },
  labels: [],
  order: 1,
  fields: { area: ProjectArea.User, primary: true },
  seq: 1,
  createdAt: at,
  ...extra,
})

const projectCard = (extra: Partial<ViableProjectCard> = {}): ViableProjectCard => ({
  id: 'project-card',
  kind: WorkcardKind.Project,
  type: VIABLE_PROJECT_TYPE,
  entityId: 'entity',
  code: 'slot-booker',
  title: 'Slot Booker',
  description: 'Book a slot.',
  parents: [],
  status: ViableProjectStatus.Draft,
  intrinsic: IntrinsicStatus.Planned,
  flows: { [VIABLE_PROJECT_FLOW]: ViableProjectStatus.Draft },
  labels: [],
  fields: { language: 'en' },
  seq: 1,
  createdAt: at,
  ...extra,
})

const spec = (category: string, body: string, revision?: number): Specification => ({
  id: `${category}-${revision ?? 0}`,
  kind: WorkcardKind.Specification,
  type: VIABLE_SPEC_TYPE,
  entityId: 'entity',
  title: category,
  parent: 'project-card',
  parents: ['project-card'],
  status: 'current',
  intrinsic: IntrinsicStatus.Closed,
  flows: {},
  labels: [],
  fields: {},
  seq: 1,
  createdAt: at,
  category,
  format: SpecificationFormat.Markdown,
  body,
  ...(revision != null ? { revision } : {}),
})

const designed = (): WorkcardDesign => workcardDesignHelper.emptyWorkcardDesign({
  code: 'US-OLD00',
  narrative: 'The narrative the design was written against.',
  area: ProjectArea.Guest,
  entities: [{ name: 'Booking', description: 'A reservation', dir: 'booking' }],
  screens: [{
    name: 'booking/list/overview',
    definition: 'booking-overview',
    path: 'sources/web/src/screens/booking-overview.tsx',
    alias: 'booking-overview',
    url: '/frontoffice/booking-overview',
    parent: 'area-user',
    adopted: false,
    specs: { ux: 'the ux', ui: 'the ui' },
    components: [],
  }],
})

describe('viable-common - the story flow', () => {
  test('keeps the status keys every stored story, selector and frontmatter already carries', () => {
    expect(Object.values(ViableWorkcardStatus)).toEqual(['planned', 'in-progress', 'completed', 'failed'])
    expect(VIABLE_WORKCARD_FLOW_SCHEMA.statuses.map(status => status.key))
      .toEqual(['planned', 'in-progress', 'completed', 'failed'])
    expect(VIABLE_WORKCARD_FLOW_SCHEMA.statuses.filter(status => status.initial === true)
      .map(status => status.key)).toEqual(['planned'])
  })

  test('maps a failed story onto PLANNED, so done is the closed count and a retry is a start', () => {
    const flow = VIABLE_WORKCARD_FLOW_SCHEMA

    expect(statusHelper.intrinsicOf(flow, ViableWorkcardStatus.Planned)).toBe(IntrinsicStatus.Planned)
    expect(statusHelper.intrinsicOf(flow, ViableWorkcardStatus.InProgress)).toBe(IntrinsicStatus.InProgress)
    expect(statusHelper.intrinsicOf(flow, ViableWorkcardStatus.Completed)).toBe(IntrinsicStatus.Closed)
    expect(statusHelper.intrinsicOf(flow, ViableWorkcardStatus.Failed)).toBe(IntrinsicStatus.Planned)
  })

  test('starts from planned or failed only, and resets from anywhere', () => {
    const flow = VIABLE_WORKCARD_FLOW_SCHEMA
    const { Planned, InProgress, Completed, Failed } = ViableWorkcardStatus

    expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Start, Planned)).toBe(true)
    expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Start, Failed)).toBe(true)
    expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Start, InProgress)).toBe(false)
    expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Start, Completed)).toBe(false)
    expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Complete, InProgress)).toBe(true)
    expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Fail, InProgress)).toBe(true)
    expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Fail, Planned)).toBe(false)
    for (const status of Object.values(ViableWorkcardStatus)) {
      expect(statusHelper.canTransit(flow, ViableWorkcardTransition.Reset, status)).toBe(true)
    }
  })

  test('offers a completed story nothing but a reset', () => {
    expect(statusHelper.transitionsFrom(VIABLE_WORKCARD_FLOW_SCHEMA, ViableWorkcardStatus.Completed).map(rule => rule.name))
      .toEqual([ViableWorkcardTransition.Reset])
  })
})

describe('viable-common - the project flow', () => {
  test('drafts, confirms, activates, and archives from anywhere', () => {
    const flow = VIABLE_PROJECT_FLOW_SCHEMA
    const { Draft, Confirmed, Active, Archived } = ViableProjectStatus

    expect(flow.statuses.find(status => status.initial === true)?.key).toBe(Draft)
    expect(statusHelper.intrinsicOf(flow, Draft)).toBe(IntrinsicStatus.Planned)
    expect(statusHelper.intrinsicOf(flow, Confirmed)).toBe(IntrinsicStatus.InProgress)
    expect(statusHelper.intrinsicOf(flow, Active)).toBe(IntrinsicStatus.InProgress)
    expect(statusHelper.intrinsicOf(flow, Archived)).toBe(IntrinsicStatus.Closed)
    expect(statusHelper.canTransit(flow, ViableProjectTransition.Confirm, Draft)).toBe(true)
    expect(statusHelper.canTransit(flow, ViableProjectTransition.Confirm, Active)).toBe(false)
    expect(statusHelper.canTransit(flow, ViableProjectTransition.Activate, Confirmed)).toBe(true)
    expect(statusHelper.canTransit(flow, ViableProjectTransition.Archive, Active)).toBe(true)
    expect(statusHelper.canTransit(flow, ViableProjectTransition.Reopen, Archived)).toBe(true)
  })
})

describe('viable-common - the viable types', () => {
  test('register into a planning schema registry and survive the wire bundle a client boots from', () => {
    const registry = makeSchemaRegistry({ types: VIABLE_TYPE_SCHEMAS, flows: VIABLE_FLOW_SCHEMAS })
    const client = makeSchemaRegistry()
    client.load(JSON.parse(JSON.stringify(registry.bundle())))

    for (const type of VIABLE_TYPE_SCHEMAS) {
      expect(() => client.validator(type.type), type.type).not.toThrow()
    }
    expect(client.primaryFlow(VIABLE_USER_STORY_TYPE).id).toBe(VIABLE_WORKCARD_FLOW)
    expect(client.validator(VIABLE_USER_STORY_TYPE)({ area: ProjectArea.Guest, primary: false })).toBe(true)
  })

  test('declares every flow a type runs, and carries a tone for every status', () => {
    const flows = new Set(VIABLE_FLOW_SCHEMAS.map(flow => flow.id))

    for (const type of VIABLE_TYPE_SCHEMAS) {
      expect(type.flows.length).toBeGreaterThan(0)
      for (const id of type.flows) expect(flows.has(id), `${type.type} → ${id}`).toBe(true)
    }
    for (const flow of VIABLE_FLOW_SCHEMAS) {
      for (const status of flow.statuses) expect(status.tone, `${flow.id}.${status.key}`).toBeDefined()
    }
  })

  test('slots the brief, the plan and the requirements under a project, the work documents under a story, and no co-located spec', () => {
    const project = VIABLE_PROJECT_TYPE_SCHEMA.specifications
    const workcard = VIABLE_USER_STORY_TYPE_SCHEMA.specifications
    const requirements = expect.objectContaining({
      category: ViableSpecCategory.Requirements, format: SpecificationFormat.Json, revisioned: true,
      keepRevisions: 3, version: REQUIREMENTS_VERSION, schema: RequirementsDocumentSchema,
    })

    expect(project.map(slot => slot.category)).toEqual([
      ViableSpecCategory.Specification, ViableSpecCategory.Vision, ViableSpecCategory.DesignSystem,
      ViableSpecCategory.Scaffold, ViableSpecCategory.Requirements,
    ])
    expect(project.find(slot => slot.category === ViableSpecCategory.Specification)?.required).toBe(true)
    expect(project.find(slot => slot.category === ViableSpecCategory.Scaffold))
      .toEqual(expect.objectContaining({ format: SpecificationFormat.Json, revisioned: true, keepRevisions: 3 }))
    expect(project.find(slot => slot.category === ViableSpecCategory.Requirements)).toEqual(requirements)
    expect(workcard.slice(0, 2)).toEqual([expect.objectContaining({
      category: ViableSpecCategory.Design, format: SpecificationFormat.Json, revisioned: true,
      keepRevisions: 3, version: WORKCARD_DESIGN_VERSION,
    }), requirements])
    expect(workcard.map(slot => slot.category)).toEqual([
      ViableSpecCategory.Design, ViableSpecCategory.Requirements, ViableSpecCategory.Plan,
      ViableSpecCategory.Operations, ViableSpecCategory.Proposals,
    ])

    const categories = VIABLE_TYPE_SCHEMAS.flatMap(type => type.specifications.map(slot => slot.category))
    for (const coLocated of Object.values(SpecCategory)) expect(categories).not.toContain(coLocated)
  })

  test('mints US- codes within the project and takes a project code as a slug within the entity', () => {
    expect(VIABLE_USER_STORY_TYPE_SCHEMA.code).toEqual({
      prefix: 'US-', style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent,
    })
    expect(VIABLE_PROJECT_TYPE_SCHEMA.code).toEqual({ style: CodeStyle.Slug, uniqueWithin: CodeScope.Entity, mutable: true })
    expect(VIABLE_USER_STORY_TYPE_SCHEMA.code?.mutable).not.toBe(true)
    expect(VIABLE_USER_STORY_TYPE_SCHEMA.relationships?.map(link => link.name)).toEqual([
      ViableRelationship.Follows, ViableRelationship.SharesWidget, ViableRelationship.SharesScreen,
    ])
  })

  test('reserves bug and requirement on the story flow without letting a project hold one', () => {
    expect(VIABLE_RESERVED_TYPE_SCHEMAS.map(type => type.code?.prefix)).toEqual(['BUG-', 'REQ-'])
    for (const type of VIABLE_RESERVED_TYPE_SCHEMAS) {
      expect(type.flows).toEqual([VIABLE_WORKCARD_FLOW])
      expect(VIABLE_PROJECT_TYPE_SCHEMA.cardTypes).not.toContain(type.type)
    }
    expect(VIABLE_PROJECT_TYPE_SCHEMA.cardTypes).toEqual([...VIABLE_WORK_TYPES])
  })
})

describe('viable-common - the viable field schemas', () => {
  const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
  const workcard = ajv.compile(ViableWorkcardFieldsSchema)
  const project = ajv.compile(ViableProjectFieldsSchema)

  test('a story accepts its area and flag, and an explicit null for an optional', () => {
    expect(workcard({ area: ProjectArea.User, primary: false })).toBe(true)
    expect(workcard({
      area: ProjectArea.Admin, primary: true, actor: WorkcardActor.Agent, warning: '', kind: UserStoryKind.Connective,
    })).toBe(true)
    expect(workcard({ area: ProjectArea.User, primary: false, kind: null, actor: null })).toBe(true)
    expect(workcard({ area: ProjectArea.User, primary: false, kind: UserStoryKind.Requested })).toBe(true)
  })

  test('a story refuses an undeclared field, a missing area, an ill-shaped area key and a value outside a closed set', () => {
    expect(workcard({ area: ProjectArea.User, primary: false, story: 'narrative' })).toBe(false)
    expect(workcard({ primary: false })).toBe(false)
    // The area is a key: a custom slug is shaped right (the project's map decides whether it is known).
    expect(workcard({ area: 'partner', primary: false })).toBe(true)
    expect(workcard({ area: 'Partner Portal', primary: false })).toBe(false)
    expect(workcard({ area: 'partner--portal', primary: false })).toBe(false)
    expect(workcard({ area: ProjectArea.User, primary: false, kind: 'queue' })).toBe(false)
  })

  test('a project accepts none of its fields, all of them, and refuses a stray one', () => {
    expect(project({})).toBe(true)
    expect(project({
      formerAliases: ['old-name'], language: 'en', blueprint: 'owlmeans', blueprintCase: 'web',
      target: null, connectLlmMode: 'local', origin: { kind: 'github', repoUrl: 'https://x/y' },
      landing: { story: 'US-ABC12', at },
    })).toBe(true)
    expect(project({ alias: 'slot-booker' })).toBe(false)
  })

  test('a project carries ONE inference setting: a conversion has no mode of its own', () => {
    // A conversion follows the session that drives it, like every other run; a card still
    // carrying the removed per-conversion key is refused rather than silently kept.
    expect(project({ connectLlmMode: 'local' })).toBe(true)
    expect(project({ converterLlmMode: 'local' })).toBe(false)
    expect(project({ converterLlmMode: null })).toBe(false)
  })

  test('a project may pin how its pipeline steps work, from the closed set', () => {
    expect(project({ workMode: 'linear' })).toBe(true)
    expect(project({ workMode: 'hybrid' })).toBe(true)
    expect(project({ workMode: null })).toBe(true)
    expect(project({ workMode: 'strict' })).toBe(false)
  })

  test('a project records a work kind from the closed set and a bounded case quote', () => {
    expect(project({ blueprintCase: 'work-management', workKind: 'crm', caseQuote: 'A CRM for ski resorts.' })).toBe(true)
    expect(project({ workKind: null, caseQuote: null })).toBe(true)
    expect(project({ workKind: 'kanban' })).toBe(false)
    expect(project({ caseQuote: '' })).toBe(false)
    expect(project({ caseQuote: 'x'.repeat(1025) })).toBe(false)
  })

  test('a project records its bot platform ids (at least one, well-formed, unique, bounded) and a bot kit from the closed set', () => {
    expect(project({ blueprintCase: 'bot', botPlatforms: ['chat'], botKit: 'moderation', caseQuote: 'A chat moderation bot.' })).toBe(true)
    expect(project({ blueprintCase: 'ai-bot', botPlatforms: ['chat', 'team-chat'], botKit: 'intake' })).toBe(true)
    expect(project({ botPlatforms: null, botKit: null })).toBe(true)
    expect(project({ botPlatforms: [] })).toBe(false)
    expect(project({ botPlatforms: ['Chat App'] })).toBe(false)
    expect(project({ botPlatforms: ['../chat'] })).toBe(false)
    expect(project({ botPlatforms: ['chat', 'chat'] })).toBe(false)
    expect(project({ botPlatforms: Array.from({ length: BOT_PLATFORMS_MAX + 1 }, (_, at) => `chat${at}`) })).toBe(false)
    expect(project({ botKit: 'marketing' })).toBe(false)
  })

  test('a story carries the landing flag, spelled or nulled', () => {
    expect(workcard({ area: ProjectArea.User, primary: false, landing: true })).toBe(true)
    expect(workcard({ area: ProjectArea.User, primary: false, landing: null })).toBe(true)
    expect(workcard({ area: ProjectArea.User, primary: false, landing: 'yes' })).toBe(false)
  })

  test('a project records a decided "no gate" as story null, and never a decision without a time', () => {
    // Absent = never decided; `story: null` = decided, no gate. Both must be spellable.
    expect(project({ landing: { story: null, at } })).toBe(true)
    expect(project({ landing: null })).toBe(true)
    expect(project({ landing: { story: 'US-ABC12' } })).toBe(false)
    expect(project({ landing: { story: 'US-ABC12', at, reason: 'best fit' } })).toBe(false)
  })

  test('a project records a tenancy decision with both flags, who decided it and when', () => {
    expect(project({ tenancy: { operators: false, users: true, by: 'model', at } })).toBe(true)
    expect(project({
      tenancy: {
        operators: true, users: true, by: 'owner', at,
        quotes: { operators: 'Each agency manages its own staff.', users: null },
      },
    })).toBe(true)
    expect(project({ tenancy: null })).toBe(true)
  })

  test('a converted project records its origin tenant compactly, bounded and closed', () => {
    const origin = { label: 'team', keys: ['teamId'], people: ['TeamMember', 'Invitation'] }
    expect(project({ tenancy: { operators: false, users: true, by: 'model', at, origin } })).toBe(true)
    expect(project({ tenancy: { operators: false, users: true, by: 'model', at, origin: null } })).toBe(true)
    expect(project({ tenancy: { operators: false, users: true, by: 'model', at, origin: { label: 'team', keys: [] } } })).toBe(false)
    expect(project({
      tenancy: { operators: false, users: true, by: 'model', at, origin: { ...origin, routes: ['/t/:teamId'] } },
    })).toBe(false)
    expect(project({
      tenancy: { operators: false, users: true, by: 'model', at, origin: { ...origin, keys: Array(9).fill('teamId') } },
    })).toBe(false)
    expect(project({
      tenancy: { operators: false, users: true, by: 'model', at, origin: { ...origin, label: 'x'.repeat(65) } },
    })).toBe(false)
  })

  test('a project refuses a partial tenancy decision, an unknown decider and a stray key', () => {
    expect(project({ tenancy: { users: true, by: 'model', at } })).toBe(false)
    expect(project({ tenancy: { operators: true, users: false, at } })).toBe(false)
    expect(project({ tenancy: { operators: true, users: false, by: 'model' } })).toBe(false)
    expect(project({ tenancy: { operators: 'yes', users: false, by: 'model', at } })).toBe(false)
    expect(project({ tenancy: { operators: true, users: false, by: 'agent', at } })).toBe(false)
    expect(project({ tenancy: { operators: true, users: false, by: 'model', at, reason: 'b2b' } })).toBe(false)
    expect(project({
      tenancy: { operators: true, users: false, by: 'model', at, quotes: { staff: 'x' } },
    })).toBe(false)
    expect(project({
      tenancy: { operators: true, users: false, by: 'model', at, quotes: { operators: 'x'.repeat(1025) } },
    })).toBe(false)
  })
})

describe('viable-common - the viable card helpers', () => {
  test('recognises a card by kind AND type', () => {
    expect(viableCardHelper.isViableWorkcard(workcardRecord())).toBe(true)
    expect(viableCardHelper.isViableWorkcard(workcardRecord({ type: 'notion:task' }))).toBe(false)
    expect(viableCardHelper.isViableProject(projectCard())).toBe(true)
    expect(viableCardHelper.isViableProject(workcardRecord())).toBe(false)
  })

  test('userStoryOf lets the card win on narrative, code, area and actor, and takes screens from the design', () => {
    const card = workcardRecord({ fields: { area: ProjectArea.User, primary: true, actor: WorkcardActor.Worker } })
    const workcard = viableCardHelper.userStoryOf(card, designed())

    expect(workcard.story).toBe(card.title)
    expect(workcard.code).toBe('US-ABC12')
    expect(workcard.area).toBe(ProjectArea.User)
    expect(workcard.actor).toBe(WorkcardActor.Worker)
    expect(workcard.screens.map(screen => screen.name)).toEqual(['booking/list/overview'])
    expect(workcard.entities.map(entity => entity.name)).toEqual(['Booking'])
    expect(viableCardHelper.userStoryOf(card).screens).toEqual([])
    expect(viableCardHelper.workcardDraftOf(card)).toEqual({ story: card.title, area: ProjectArea.User })
  })

  test('projectBriefOf reads the highest revision per part and answers an unwritten part empty', () => {
    const brief = viableSpecHelper.projectBriefOf(projectCard(), [
      spec(ViableSpecCategory.Specification, 'first', 1),
      spec(ViableSpecCategory.Specification, 'second', 2),
      spec(ViableSpecCategory.Vision, 'the vision'),
    ])

    expect(brief).toEqual({
      name: 'Slot Booker', alias: 'slot-booker', description: 'Book a slot.', specification: 'second',
      vision: 'the vision', designSystem: '', language: 'en',
    })
  })

  test('storyWriteInputOf takes code, narrative and primary from the card, and refuses a card with no code', () => {
    const content = {
      userStory: viableCardHelper.userStoryOf(workcardRecord()), screenPaths: {}, componentPaths: {}, transitions: [],
      section: 'Booking',
    }

    expect(viableCardHelper.workcardWriteInputOf(workcardRecord(), content)).toEqual(expect.objectContaining({
      code: 'US-ABC12', narrative: 'A member books a slot.', primary: true,
      status: ViableWorkcardStatus.Planned, section: 'Booking',
    }))
    expect(viableCardHelper.workcardWriteInputOf(workcardRecord(), { ...content, status: ViableWorkcardStatus.Completed }).status)
      .toBe(ViableWorkcardStatus.Completed)
    expect(() => viableCardHelper.workcardWriteInputOf(workcardRecord({ code: undefined }), content))
      .toThrow(ProjectWorkcardMissconfigured)
  })

  test('storyWriteInputOf copies the landing flag from the card, and only when it is set', () => {
    const content = {
      userStory: viableCardHelper.userStoryOf(workcardRecord()), screenPaths: {}, componentPaths: {}, transitions: [],
    }
    const landing = workcardRecord({ fields: { area: ProjectArea.User, primary: false, landing: true } })

    expect(viableCardHelper.workcardWriteInputOf(landing, content).landing).toBe(true)
    expect('landing' in viableCardHelper.workcardWriteInputOf(workcardRecord(), content)).toBe(false)
  })

  test('only a person writes through the web and connect channels', () => {
    expect(viableCardHelper.isUserChannel(ViableChannel.Web)).toBe(true)
    expect(viableCardHelper.isUserChannel(ViableChannel.Connect)).toBe(true)
    expect(viableCardHelper.isUserChannel(ViableChannel.Pipeline)).toBe(false)
    expect(viableCardHelper.isUserChannel(undefined)).toBe(false)
  })
})

describe('viable-common - the landing sentence', () => {
  test('is appended once, with one space, and a resumed step never adds a second copy', () => {
    const once = landingSentenceHelper.withLandingSentence('A member books a slot.')

    expect(once).toBe(`A member books a slot. ${LANDING_USER_STORY_SENTENCE}`)
    expect(landingSentenceHelper.withLandingSentence(once)).toBe(once)
    expect(landingSentenceHelper.hasLandingSentence(once)).toBe(true)
    expect(landingSentenceHelper.hasLandingSentence('A member books a slot.')).toBe(false)
  })

  test('is recognised whatever whitespace a person left around it', () => {
    const rewrapped = `A member books a slot.\n${LANDING_USER_STORY_SENTENCE.replace('; after', ';\n  after')}`

    expect(landingSentenceHelper.hasLandingSentence(rewrapped)).toBe(true)
    expect(landingSentenceHelper.withLandingSentence(rewrapped)).toBe(rewrapped)
  })

  test('never makes a title longer than a card accepts, and never cuts the narrative', () => {
    const long = 'x'.repeat(TITLE_MAX - 10)

    expect(landingSentenceHelper.withLandingSentence(long)).toBe(long)
    expect(landingSentenceHelper.withLandingSentence('x'.repeat(TITLE_MAX - LANDING_USER_STORY_SENTENCE.length - 1)).length)
      .toBe(TITLE_MAX)
    expect(landingSentenceHelper.withLandingSentence('  ')).toBe(LANDING_USER_STORY_SENTENCE)
  })
})

describe('viable-common - the follows anchor', () => {
  test('mergeConnectingStories carries the clamped anchor on each connective entry', () => {
    const flow = [
      { story: 'One', area: ProjectArea.User },
      { story: 'Two', area: ProjectArea.User },
      { story: 'Three', area: ProjectArea.Admin },
    ]
    const merged = connectingUserStoryHelper.mergeConnectingUserStories(flow, [
      { story: 'Queue', area: ProjectArea.Admin, kind: ConnectingUserStoryKind.Queue, after: 9 },
      { story: 'Tracker', area: ProjectArea.User, kind: ConnectingUserStoryKind.Tracker, after: 1 },
    ])

    expect(merged.map(({ story: workcard, kind, after }) => ({ story: workcard, kind, after }))).toEqual([
      { story: 'One', kind: UserStoryKind.Flow, after: undefined },
      { story: 'Tracker', kind: UserStoryKind.Connective, after: 1 },
      { story: 'Two', kind: UserStoryKind.Flow, after: undefined },
      { story: 'Three', kind: UserStoryKind.Flow, after: undefined },
      { story: 'Queue', kind: UserStoryKind.Connective, after: 3 },
    ])
  })

  test('a story\'s area is its key — a project\'s own area travels on `area` exactly like a standard one', () => {
    const merged = connectingUserStoryHelper.mergeConnectingUserStories([
      { story: 'One', area: 'field-ops' },
      { story: 'Two', area: ProjectArea.User },
    ], [
      { story: 'Crew queue', area: 'field-ops', kind: ConnectingUserStoryKind.Queue, after: 1 },
    ])

    expect(merged).toEqual([
      { story: 'One', area: 'field-ops', kind: UserStoryKind.Flow },
      { story: 'Crew queue', area: 'field-ops', kind: UserStoryKind.Connective, after: 1 },
      { story: 'Two', area: ProjectArea.User, kind: UserStoryKind.Flow },
    ])
    expect(merged.map(entry => Object.keys(entry))).toEqual([
      ['story', 'area', 'kind'], ['story', 'area', 'kind', 'after'], ['story', 'area', 'kind'],
    ])
  })
})

describe('viable-common - the project refusals', () => {
  test('keep the type names and markers the browser and the connector match on', () => {
    const occupied = ResilientError.ensure(new ProjectAgentOccupied('story').marshal())
    const refused = ResilientError.ensure(new ProjectWorkcardMissconfigured('wrong-status').marshal())

    expect(occupied).toBeInstanceOf(ProjectAgentOccupied)
    expect(occupied.type).toBe('OccupiedAgentViableProjectResilientError')
    expect(occupied.message).toContain('viable-project:agent:occupied:story')
    expect(refused).toBeInstanceOf(ProjectWorkcardMissconfigured)
    expect(refused.message).toContain('viable-project:story:missconfigured:wrong-status')
    expect(new ProjectNotFound('x').type).toBe('NotFoundViableProjectResourceError')
  })
})
