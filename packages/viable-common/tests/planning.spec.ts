import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { ResilientError } from '@owlmeans/error'
import {
  canTransit, CodeScope, CodeStyle, intrinsicOf, IntrinsicStatus, makeSchemaRegistry,
  SpecificationFormat, TITLE_MAX, transitionsFrom, WorkcardKind,
} from '@owlmeans/planning'
import type { Specification } from '@owlmeans/planning'
import { ProjectArea } from '../src/areas/consts.js'
import { ConnectingStoryKind, SpecCategory, StoryKind } from '../src/ba/consts.js'
import { mergeConnectingStories } from '../src/ba/helpers.js'
import { STORY_DESIGN_VERSION } from '../src/design/consts.js'
import { emptyStoryDesign } from '../src/design/helpers.js'
import { StoryActor } from '../src/design/runtime.js'
import type { StoryDesign } from '../src/design/types.js'
import {
  hasLandingSentence, LANDING_STORY_SENTENCE, withLandingSentence,
} from '../src/index.js'
import {
  isUserChannel, isViableProject, isViableStory, ProjectAgentOccupied, ProjectNotFound,
  ProjectStoryMissconfigured, projectBriefOf, storyDraftOf, storyWriteInputOf, userStoryOf,
  VIABLE_FLOW_SCHEMAS, VIABLE_PROJECT_FLOW, VIABLE_PROJECT_FLOW_SCHEMA, VIABLE_PROJECT_TYPE,
  VIABLE_PROJECT_TYPE_SCHEMA, VIABLE_RESERVED_TYPE_SCHEMAS, VIABLE_SPEC_TYPE, VIABLE_STORY_FLOW,
  VIABLE_STORY_FLOW_SCHEMA,
  VIABLE_STORY_TYPE, VIABLE_STORY_TYPE_SCHEMA, VIABLE_TYPE_SCHEMAS, ViableChannel,
  ViableProjectFieldsSchema, ViableProjectStatus, ViableProjectTransition, ViableRelationship,
  ViableSpecCategory, ViableStoryFieldsSchema, ViableStoryStatus, ViableStoryTransition,
} from '../src/planning/index.js'
import type { ViableProjectCard, ViableStoryCard } from '../src/planning/index.js'

const at = '2026-09-16T10:00:00.000Z'

const storyCard = (extra: Partial<ViableStoryCard> = {}): ViableStoryCard => ({
  id: 'story-card',
  kind: WorkcardKind.Card,
  type: VIABLE_STORY_TYPE,
  entityId: 'entity',
  code: 'US-ABC12',
  title: 'A member books a slot.',
  parent: 'project-card',
  parents: ['project-card'],
  status: ViableStoryStatus.Planned,
  intrinsic: IntrinsicStatus.Planned,
  flows: { [VIABLE_STORY_FLOW]: ViableStoryStatus.Planned },
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

const designed = (): StoryDesign => emptyStoryDesign({
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
    expect(Object.values(ViableStoryStatus)).toEqual(['planned', 'in-progress', 'completed', 'failed'])
    expect(VIABLE_STORY_FLOW_SCHEMA.statuses.map(status => status.key))
      .toEqual(['planned', 'in-progress', 'completed', 'failed'])
    expect(VIABLE_STORY_FLOW_SCHEMA.statuses.filter(status => status.initial === true)
      .map(status => status.key)).toEqual(['planned'])
  })

  test('maps a failed story onto PLANNED, so done is the closed count and a retry is a start', () => {
    const flow = VIABLE_STORY_FLOW_SCHEMA

    expect(intrinsicOf(flow, ViableStoryStatus.Planned)).toBe(IntrinsicStatus.Planned)
    expect(intrinsicOf(flow, ViableStoryStatus.InProgress)).toBe(IntrinsicStatus.InProgress)
    expect(intrinsicOf(flow, ViableStoryStatus.Completed)).toBe(IntrinsicStatus.Closed)
    expect(intrinsicOf(flow, ViableStoryStatus.Failed)).toBe(IntrinsicStatus.Planned)
  })

  test('starts from planned or failed only, and resets from anywhere', () => {
    const flow = VIABLE_STORY_FLOW_SCHEMA
    const { Planned, InProgress, Completed, Failed } = ViableStoryStatus

    expect(canTransit(flow, ViableStoryTransition.Start, Planned)).toBe(true)
    expect(canTransit(flow, ViableStoryTransition.Start, Failed)).toBe(true)
    expect(canTransit(flow, ViableStoryTransition.Start, InProgress)).toBe(false)
    expect(canTransit(flow, ViableStoryTransition.Start, Completed)).toBe(false)
    expect(canTransit(flow, ViableStoryTransition.Complete, InProgress)).toBe(true)
    expect(canTransit(flow, ViableStoryTransition.Fail, InProgress)).toBe(true)
    expect(canTransit(flow, ViableStoryTransition.Fail, Planned)).toBe(false)
    for (const status of Object.values(ViableStoryStatus)) {
      expect(canTransit(flow, ViableStoryTransition.Reset, status)).toBe(true)
    }
  })

  test('offers a completed story nothing but a reset', () => {
    expect(transitionsFrom(VIABLE_STORY_FLOW_SCHEMA, ViableStoryStatus.Completed).map(rule => rule.name))
      .toEqual([ViableStoryTransition.Reset])
  })
})

describe('viable-common - the project flow', () => {
  test('drafts, confirms, activates, and archives from anywhere', () => {
    const flow = VIABLE_PROJECT_FLOW_SCHEMA
    const { Draft, Confirmed, Active, Archived } = ViableProjectStatus

    expect(flow.statuses.find(status => status.initial === true)?.key).toBe(Draft)
    expect(intrinsicOf(flow, Draft)).toBe(IntrinsicStatus.Planned)
    expect(intrinsicOf(flow, Confirmed)).toBe(IntrinsicStatus.InProgress)
    expect(intrinsicOf(flow, Active)).toBe(IntrinsicStatus.InProgress)
    expect(intrinsicOf(flow, Archived)).toBe(IntrinsicStatus.Closed)
    expect(canTransit(flow, ViableProjectTransition.Confirm, Draft)).toBe(true)
    expect(canTransit(flow, ViableProjectTransition.Confirm, Active)).toBe(false)
    expect(canTransit(flow, ViableProjectTransition.Activate, Confirmed)).toBe(true)
    expect(canTransit(flow, ViableProjectTransition.Archive, Active)).toBe(true)
    expect(canTransit(flow, ViableProjectTransition.Reopen, Archived)).toBe(true)
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
    expect(client.primaryFlow(VIABLE_STORY_TYPE).id).toBe(VIABLE_STORY_FLOW)
    expect(client.validator(VIABLE_STORY_TYPE)({ area: ProjectArea.Guest, primary: false })).toBe(true)
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

  test('slots the brief and the plan under a project, the design under a story, and no co-located spec', () => {
    const project = VIABLE_PROJECT_TYPE_SCHEMA.specifications
    const story = VIABLE_STORY_TYPE_SCHEMA.specifications

    expect(project.map(slot => slot.category)).toEqual([
      ViableSpecCategory.Specification, ViableSpecCategory.Vision, ViableSpecCategory.DesignSystem,
      ViableSpecCategory.Scaffold,
    ])
    expect(project.find(slot => slot.category === ViableSpecCategory.Specification)?.required).toBe(true)
    expect(project.find(slot => slot.category === ViableSpecCategory.Scaffold))
      .toEqual(expect.objectContaining({ format: SpecificationFormat.Json, revisioned: true, keepRevisions: 3 }))
    expect(story).toEqual([expect.objectContaining({
      category: ViableSpecCategory.Design, format: SpecificationFormat.Json, revisioned: true,
      keepRevisions: 3, version: STORY_DESIGN_VERSION,
    })])

    const categories = VIABLE_TYPE_SCHEMAS.flatMap(type => type.specifications.map(slot => slot.category))
    for (const coLocated of Object.values(SpecCategory)) expect(categories).not.toContain(coLocated)
  })

  test('mints US- codes within the project and takes a project code as a slug within the entity', () => {
    expect(VIABLE_STORY_TYPE_SCHEMA.code).toEqual({
      prefix: 'US-', style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent,
    })
    expect(VIABLE_PROJECT_TYPE_SCHEMA.code).toEqual({ style: CodeStyle.Slug, uniqueWithin: CodeScope.Entity, mutable: true })
    expect(VIABLE_STORY_TYPE_SCHEMA.code?.mutable).not.toBe(true)
    expect(VIABLE_STORY_TYPE_SCHEMA.relationships?.map(link => link.name)).toEqual([
      ViableRelationship.Follows, ViableRelationship.SharesWidget, ViableRelationship.SharesScreen,
    ])
  })

  test('reserves bug, improvement and requirement on the story flow without letting a project hold one', () => {
    expect(VIABLE_RESERVED_TYPE_SCHEMAS.map(type => type.code?.prefix)).toEqual(['BUG-', 'IMP-', 'REQ-'])
    for (const type of VIABLE_RESERVED_TYPE_SCHEMAS) {
      expect(type.flows).toEqual([VIABLE_STORY_FLOW])
      expect(VIABLE_PROJECT_TYPE_SCHEMA.cardTypes).not.toContain(type.type)
    }
    expect(VIABLE_PROJECT_TYPE_SCHEMA.cardTypes).toEqual([VIABLE_STORY_TYPE])
  })
})

describe('viable-common - the viable field schemas', () => {
  const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
  const story = ajv.compile(ViableStoryFieldsSchema)
  const project = ajv.compile(ViableProjectFieldsSchema)

  test('a story accepts its area and flag, and an explicit null for an optional', () => {
    expect(story({ area: ProjectArea.User, primary: false })).toBe(true)
    expect(story({
      area: ProjectArea.Admin, primary: true, actor: StoryActor.Agent, warning: '', kind: StoryKind.Connective,
    })).toBe(true)
    expect(story({ area: ProjectArea.User, primary: false, kind: null, actor: null })).toBe(true)
  })

  test('a story refuses an undeclared field, a missing area, and a value outside a closed set', () => {
    expect(story({ area: ProjectArea.User, primary: false, story: 'narrative' })).toBe(false)
    expect(story({ primary: false })).toBe(false)
    expect(story({ area: 'partner', primary: false })).toBe(false)
    expect(story({ area: ProjectArea.User, primary: false, kind: 'queue' })).toBe(false)
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

  test('a story carries the landing flag, spelled or nulled', () => {
    expect(story({ area: ProjectArea.User, primary: false, landing: true })).toBe(true)
    expect(story({ area: ProjectArea.User, primary: false, landing: null })).toBe(true)
    expect(story({ area: ProjectArea.User, primary: false, landing: 'yes' })).toBe(false)
  })

  test('a project records a decided "no gate" as story null, and never a decision without a time', () => {
    // Absent = never decided; `story: null` = decided, no gate. Both must be spellable.
    expect(project({ landing: { story: null, at } })).toBe(true)
    expect(project({ landing: null })).toBe(true)
    expect(project({ landing: { story: 'US-ABC12' } })).toBe(false)
    expect(project({ landing: { story: 'US-ABC12', at, reason: 'best fit' } })).toBe(false)
  })
})

describe('viable-common - the viable card helpers', () => {
  test('recognises a card by kind AND type', () => {
    expect(isViableStory(storyCard())).toBe(true)
    expect(isViableStory(storyCard({ type: 'notion:task' }))).toBe(false)
    expect(isViableProject(projectCard())).toBe(true)
    expect(isViableProject(storyCard())).toBe(false)
  })

  test('userStoryOf lets the card win on narrative, code, area and actor, and takes screens from the design', () => {
    const card = storyCard({ fields: { area: ProjectArea.User, primary: true, actor: StoryActor.Worker } })
    const story = userStoryOf(card, designed())

    expect(story.story).toBe(card.title)
    expect(story.code).toBe('US-ABC12')
    expect(story.area).toBe(ProjectArea.User)
    expect(story.actor).toBe(StoryActor.Worker)
    expect(story.screens.map(screen => screen.name)).toEqual(['booking/list/overview'])
    expect(story.entities.map(entity => entity.name)).toEqual(['Booking'])
    expect(userStoryOf(card).screens).toEqual([])
    expect(storyDraftOf(card)).toEqual({ story: card.title, area: ProjectArea.User })
  })

  test('projectBriefOf reads the highest revision per part and answers an unwritten part empty', () => {
    const brief = projectBriefOf(projectCard(), [
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
      userStory: userStoryOf(storyCard()), screenPaths: {}, componentPaths: {}, transitions: [],
      section: 'Booking',
    }

    expect(storyWriteInputOf(storyCard(), content)).toEqual(expect.objectContaining({
      code: 'US-ABC12', narrative: 'A member books a slot.', primary: true,
      status: ViableStoryStatus.Planned, section: 'Booking',
    }))
    expect(storyWriteInputOf(storyCard(), { ...content, status: ViableStoryStatus.Completed }).status)
      .toBe(ViableStoryStatus.Completed)
    expect(() => storyWriteInputOf(storyCard({ code: undefined }), content))
      .toThrow(ProjectStoryMissconfigured)
  })

  test('storyWriteInputOf copies the landing flag from the card, and only when it is set', () => {
    const content = {
      userStory: userStoryOf(storyCard()), screenPaths: {}, componentPaths: {}, transitions: [],
    }
    const landing = storyCard({ fields: { area: ProjectArea.User, primary: false, landing: true } })

    expect(storyWriteInputOf(landing, content).landing).toBe(true)
    expect('landing' in storyWriteInputOf(storyCard(), content)).toBe(false)
  })

  test('only a person writes through the web and connect channels', () => {
    expect(isUserChannel(ViableChannel.Web)).toBe(true)
    expect(isUserChannel(ViableChannel.Connect)).toBe(true)
    expect(isUserChannel(ViableChannel.Pipeline)).toBe(false)
    expect(isUserChannel(undefined)).toBe(false)
  })
})

describe('viable-common - the landing sentence', () => {
  test('is appended once, with one space, and a resumed step never adds a second copy', () => {
    const once = withLandingSentence('A member books a slot.')

    expect(once).toBe(`A member books a slot. ${LANDING_STORY_SENTENCE}`)
    expect(withLandingSentence(once)).toBe(once)
    expect(hasLandingSentence(once)).toBe(true)
    expect(hasLandingSentence('A member books a slot.')).toBe(false)
  })

  test('is recognised whatever whitespace a person left around it', () => {
    const rewrapped = `A member books a slot.\n${LANDING_STORY_SENTENCE.replace('; after', ';\n  after')}`

    expect(hasLandingSentence(rewrapped)).toBe(true)
    expect(withLandingSentence(rewrapped)).toBe(rewrapped)
  })

  test('never makes a title longer than a card accepts, and never cuts the narrative', () => {
    const long = 'x'.repeat(TITLE_MAX - 10)

    expect(withLandingSentence(long)).toBe(long)
    expect(withLandingSentence('x'.repeat(TITLE_MAX - LANDING_STORY_SENTENCE.length - 1)).length)
      .toBe(TITLE_MAX)
    expect(withLandingSentence('  ')).toBe(LANDING_STORY_SENTENCE)
  })
})

describe('viable-common - the follows anchor', () => {
  test('mergeConnectingStories carries the clamped anchor on each connective entry', () => {
    const flow = [
      { story: 'One', area: ProjectArea.User },
      { story: 'Two', area: ProjectArea.User },
      { story: 'Three', area: ProjectArea.Admin },
    ]
    const merged = mergeConnectingStories(flow, [
      { story: 'Queue', area: ProjectArea.Admin, kind: ConnectingStoryKind.Queue, after: 9 },
      { story: 'Tracker', area: ProjectArea.User, kind: ConnectingStoryKind.Tracker, after: 1 },
    ])

    expect(merged.map(({ story, kind, after }) => ({ story, kind, after }))).toEqual([
      { story: 'One', kind: StoryKind.Flow, after: undefined },
      { story: 'Tracker', kind: StoryKind.Connective, after: 1 },
      { story: 'Two', kind: StoryKind.Flow, after: undefined },
      { story: 'Three', kind: StoryKind.Flow, after: undefined },
      { story: 'Queue', kind: StoryKind.Connective, after: 3 },
    ])
  })
})

describe('viable-common - the project refusals', () => {
  test('keep the type names and markers the browser and the connector match on', () => {
    const occupied = ResilientError.ensure(new ProjectAgentOccupied('story').marshal())
    const refused = ResilientError.ensure(new ProjectStoryMissconfigured('wrong-status').marshal())

    expect(occupied).toBeInstanceOf(ProjectAgentOccupied)
    expect(occupied.type).toBe('OccupiedAgentViableProjectResilientError')
    expect(occupied.message).toContain('viable-project:agent:occupied:story')
    expect(refused).toBeInstanceOf(ProjectStoryMissconfigured)
    expect(refused.message).toContain('viable-project:story:missconfigured:wrong-status')
    expect(new ProjectNotFound('x').type).toBe('NotFoundViableProjectResourceError')
  })
})
