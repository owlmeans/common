import { describe, expect, test } from 'bun:test'
import * as barrel from '../src/index.js'
import { ProjectArea } from '../src/areas/consts.js'
import { projectStructureHelper as structureHelper } from '../src/topology/structure.js'
import { STRUCTURE_CHANGE_OPS, StructurePartKind as Kind } from '../src/topology/structure/consts.js'
import type { ProjectStructure, StructurePart } from '../src/topology/structure/types.js'

/**
 * What the platform lists as "what the agent changed" between the person's structure and an advised
 * one: `projectStructureHelper.diff` — pure, deterministic, ordered by part then op, both sides settled
 * first so an editor payload without indices or required edges is not a change.
 */
const ALL = [ProjectArea.User, ProjectArea.Admin, ProjectArea.Operator]

const base = (): ProjectStructure => structureHelper.defaultFor(ALL)

const partOf = (structure: ProjectStructure, name: string): StructurePart => structure.parts.find(part => part.name === name)!

describe('projectStructureHelper.diff', () => {
  test('is on the barrel and answers nothing for equal structures', () => {
    expect(barrel.projectStructureHelper.diff).toBe(structureHelper.diff)
    expect(barrel.STRUCTURE_CHANGE_OPS).toEqual(['add', 'remove', 'kind', 'purpose', 'areas', 'mount', 'depends', 'queues'])
    expect(structureHelper.diff(base(), base())).toEqual([])
  })

  test('settles both sides first: absent indices and required edges are no change', () => {
    const raw = base()
    const bare: ProjectStructure = {
      ...raw,
      parts: raw.parts.map(({ index: _index, ...part }) => ({ ...part, dependsOn: [] })),
    }

    expect(structureHelper.diff(raw, bare)).toEqual([])
    expect(structureHelper.diff(bare, raw)).toEqual([])
  })

  test('lists an added and a removed part with their kinds', () => {
    const before = base()
    const after: ProjectStructure = {
      ...before,
      parts: [
        ...structuredClone(before.parts).filter(part => part.name !== 'backoffice'),
        { name: 'pricing', kind: Kind.Library, dependsOn: [], purpose: 'Price formulas.' },
      ],
    }
    partOf(after, 'admin').areas = [ProjectArea.Admin, ProjectArea.Operator]

    expect(structureHelper.diff(before, after)).toEqual([
      { op: 'areas', part: 'admin', from: 'admin', to: 'admin, operator' },
      { op: 'remove', part: 'backoffice', from: Kind.Pair },
      { op: 'add', part: 'pricing', to: Kind.Library },
    ])
  })

  test('lists each changed aspect of a kept part, in op order', () => {
    const before = base()
    const after = structuredClone(before)
    const admin = partOf(after, 'admin')
    admin.kind = Kind.Web
    admin.purpose = 'Настройки владельца.'
    admin.mount = 'manage'
    admin.dependsOn = ['common', 'backoffice']
    const worker = partOf(after, 'worker')
    worker.queues = ['mail', 'jobs']

    expect(structureHelper.diff(before, after)).toEqual([
      { op: 'kind', part: 'admin', from: Kind.Pair, to: Kind.Web },
      { op: 'purpose', part: 'admin', from: partOf(before, 'admin').purpose, to: 'Настройки владельца.' },
      { op: 'mount', part: 'admin', from: 'admin', to: 'manage' },
      // Sets, sorted: the web keeps common and names the part it calls.
      { op: 'depends', part: 'admin', from: 'backend, common', to: 'backoffice, common' },
      // The stock worker's absent queues resolve to its own queue.
      { op: 'queues', part: 'worker', from: 'jobs', to: 'jobs, mail' },
    ])
  })

  test('reads the areas in order (the first is the home), and dependencies and queues as sets', () => {
    const before = base()
    const reordered = structuredClone(before)
    partOf(reordered, 'main').areas = [ProjectArea.User, ProjectArea.Guest]
    partOf(reordered, 'main').dependsOn = ['backend', 'common']

    expect(structureHelper.diff(before, reordered)).toEqual([
      { op: 'areas', part: 'main', from: 'guest, user', to: 'user, guest' },
    ])
  })

  test('compares purposes only where both sides carry one, trimmed', () => {
    const before = base()
    const keys = structureHelper.refOf(before)
    const spaced = structuredClone(before)
    partOf(spaced, 'common').purpose = `  ${partOf(before, 'common').purpose}  `

    expect(structureHelper.diff(before, keys)).toEqual([])
    expect(structureHelper.diff(keys, before)).toEqual([])
    expect(structureHelper.diff(before, spaced)).toEqual([])
  })

  test('leaves an absent value out and keeps main\'s mount as \'\'', () => {
    const before: ProjectStructure = {
      ...base(),
      parts: [...base().parts, { name: 'mailer', kind: Kind.Worker, dependsOn: [], purpose: 'Sends mail.' }],
    }
    const after = structuredClone(before)
    const mailer = partOf(after, 'mailer')
    mailer.kind = Kind.Api
    mailer.mount = 'mail'
    delete mailer.queues

    const changes = structureHelper.diff(before, after)
    expect(changes).toEqual([
      { op: 'kind', part: 'mailer', from: Kind.Worker, to: Kind.Api },
      { op: 'mount', part: 'mailer', to: 'mail' },
      // The extra worker's absent queues resolve to its own name; an api consumes none.
      { op: 'queues', part: 'mailer', from: 'mailer' },
    ])
    expect(changes.every(entry => STRUCTURE_CHANGE_OPS.includes(entry.op))).toBe(true)
  })

  test('is deterministic whatever the parts\' order', () => {
    const before = base()
    const after = structuredClone(before)
    after.parts.reverse()
    partOf(after, 'backoffice').purpose = 'Staff.'
    partOf(after, 'admin').purpose = 'Owner.'

    const changes = structureHelper.diff(before, after)
    expect(changes.map(entry => `${entry.part}:${entry.op}`)).toEqual(['admin:purpose', 'backoffice:purpose'])
    expect(structureHelper.diff(before, after)).toEqual(changes)
  })
})
