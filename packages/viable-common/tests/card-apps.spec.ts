import { describe, expect, test } from 'bun:test'
import { appMapHelper } from '../src/topology/apps.js'
import { topologyCardHelper } from '../src/topology/card.js'
import { DEFAULT_TOPOLOGY, LEGACY_TOPOLOGY, TOPOLOGY_VERSION } from '../src/topology/consts.js'
import { topologyHelper } from '../src/topology/resolve.js'
import type { TopologyDescriptor } from '../src/topology/types.js'
import { yamlUtils } from '../src/utils/yaml.js'

/**
 * `.agents/memory/topology.md` now may carry the project's app map. Every record written before —
 * and every record of a one-app project — must read and render exactly as it did, because the
 * publisher, the agent and the manifest all act on what this parses.
 *
 * The YAML fixtures below are what the platform's writer (`YAML.stringify`, yaml 2.x, through the
 * library's `frontmatterHelper`) actually emits for these records.
 */
const LEGACY_YAML = 'id: owlmeans-fullstack\ndir: sources\npackages:\n  - name: common\n    roles:\n      - common\n'
  + '    kind: library\n    dependsOn: []\n  - name: backend\n    roles:\n      - backend\n    kind: library\n'
  + '    dependsOn:\n      - common\n  - name: api\n    roles:\n      - api\n    kind: bundle\n    dependsOn:\n'
  + '      - common\n      - backend\n  - name: web\n    roles:\n      - web\n      - frontend\n    kind: bundle\n'
  + '    dependsOn:\n      - common\n  - name: worker\n    roles:\n      - worker\n    kind: bundle\n    dependsOn:\n'
  + '      - common\n      - backend\n    queues:\n      - mail\n      - reports\nversion: 1\n'
  + 'updatedAt: 2026-10-01T09:30:00.000Z\n'

const SPLIT_YAML = `id: owlmeans-fullstack
dir: sources
packages:
  - name: common
    roles:
      - common
    kind: library
    dependsOn: []
  - name: backend
    roles:
      - backend
    kind: library
    dependsOn:
      - common
  - name: api
    roles:
      - api
    kind: bundle
    dependsOn:
      - common
      - backend
  - name: web
    roles:
      - web
      - frontend
    kind: bundle
    dependsOn:
      - common
  - name: worker
    roles:
      - worker
    kind: bundle
    dependsOn:
      - common
      - backend
  - name: admin-api
    roles:
      - api
    kind: bundle
    dependsOn:
      - common
      - backend
    app: admin
    mount: admin
  - name: admin-web
    roles:
      - web
      - frontend
    kind: bundle
    dependsOn:
      - common
    app: admin
    mount: admin
  - name: backoffice-api
    roles:
      - api
    kind: bundle
    dependsOn:
      - common
      - backend
    app: backoffice
    mount: backoffice
  - name: backoffice-web
    roles:
      - web
      - frontend
    kind: bundle
    dependsOn:
      - common
    app: backoffice
    mount: backoffice
areas:
  - key: guest
    kind: guest
    segment: ""
  - key: user
    kind: user
    segment: frontoffice
  - key: admin
    kind: admin
    segment: admin
  - key: operator
    kind: operator
    segment: backoffice
apps:
  - name: main
    mount: ""
    areas:
      - guest
      - user
    web: web
    api: api
    index: 0
  - name: admin
    mount: admin
    areas:
      - admin
    web: admin-web
    api: admin-api
    index: 1
  - name: backoffice
    mount: backoffice
    areas:
      - operator
    web: backoffice-web
    api: backoffice-api
    index: 2
version: 1
updatedAt: 2026-11-11T10:00:00.000Z
`

const fileOf = (yaml: string, body = '# Topology\n'): string => `---\n${yaml.trimEnd()}\n---\n\n${body}`

const LEGACY_TOPOLOGY_WITH_QUEUES: TopologyDescriptor = {
  ...DEFAULT_TOPOLOGY,
  packages: DEFAULT_TOPOLOGY.packages.map(pkg => pkg.name === 'worker' ? { ...pkg, queues: ['mail', 'reports'] } : pkg),
}

/** What the renderer produced before apps existed — pinned byte for byte. */
const LEGACY_CARD = '# Topology\n\nWhich packages this project has, what each one is, and which compile against which.\n'
  + 'Built in the order of the table — a `library` must be built before anything importing it.\n\n'
  + '| Package | Roles | Kind | Depends on | Notes |\n|---|---|---|---|---|\n'
  + '| `sources/common` | common | library | — | — |\n| `sources/backend` | backend | library | common | — |\n'
  + '| `sources/api` | api | bundle | common, backend | — |\n| `sources/web` | web, frontend | bundle | common | — |\n'
  + '| `sources/worker` | worker | bundle | common, backend | queues: mail, reports |\n'

const V1_CARD = '# Topology\n\nWhich packages this project has, what each one is, and which compile against which.\n'
  + 'Built in the order of the table — a `library` must be built before anything importing it.\n\n'
  + '| Package | Roles | Kind | Depends on | Notes |\n|---|---|---|---|---|\n'
  + '| `packages/common` | common | library | — | — |\n| `packages/backend` | backend, api | bundle | common | — |\n'
  + '| `packages/frontend` | frontend, web | bundle | common | — |\n'

const splitTopology = (): TopologyDescriptor => {
  const map = appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator'])

  return {
    ...DEFAULT_TOPOLOGY,
    packages: [...DEFAULT_TOPOLOGY.packages, ...appMapHelper.packagesOf(map)],
    areas: map.areas,
    apps: map.apps,
  }
}

describe('viable-common - a topology record written before apps', () => {
  test('parses exactly as it always has', () => {
    expect(topologyCardHelper.parseTopologyFile(fileOf(LEGACY_YAML))).toEqual(LEGACY_TOPOLOGY_WITH_QUEUES)
    expect(Object.keys(topologyCardHelper.parseTopologyFile(fileOf(LEGACY_YAML))!)).toEqual(['id', 'dir', 'packages'])
  })

  test('renders byte for byte as before — both layouts', () => {
    expect(topologyCardHelper.renderTopologyCard(LEGACY_TOPOLOGY_WITH_QUEUES)).toBe(LEGACY_CARD)
    expect(topologyCardHelper.renderTopologyCard(LEGACY_TOPOLOGY)).toBe(V1_CARD)
  })

  test('a one-app record renders as before too, and a record of main alone keeps its apps key', () => {
    const one = { ...LEGACY_TOPOLOGY_WITH_QUEUES, apps: appMapHelper.legacy().apps }
    expect(topologyCardHelper.renderTopologyCard(one)).toBe(LEGACY_CARD)
    expect(topologyCardHelper.parseTopologyMeta({ ...one, version: 1 })?.apps).toEqual(appMapHelper.legacy().apps)
  })

  test('the topology meta of a record without apps adds nothing but version and time', () => {
    const meta = topologyCardHelper.topologyMeta(DEFAULT_TOPOLOGY)
    expect(Object.keys(meta)).toEqual(['id', 'dir', 'packages', 'version', 'updatedAt'])
    expect(meta.version).toBe(TOPOLOGY_VERSION)
    expect(TOPOLOGY_VERSION).toBe(1)
  })

  test('two records without apps compare as before', () => {
    expect(topologyHelper.sameTopology(DEFAULT_TOPOLOGY, { ...DEFAULT_TOPOLOGY, id: 'recorded' })).toBe(true)
    expect(topologyHelper.sameTopology(DEFAULT_TOPOLOGY, LEGACY_TOPOLOGY)).toBe(false)
  })
})

describe('viable-common - a topology record of a split project', () => {
  test('round-trips through the writer\'s YAML: packages with app and mount, areas, apps', () => {
    expect(topologyCardHelper.parseTopologyFile(fileOf(SPLIT_YAML))).toEqual(splitTopology())
  })

  test('the meta of a split topology carries the map', () => {
    const meta = topologyCardHelper.topologyMeta(splitTopology())
    expect(meta.apps).toEqual(splitTopology().apps)
    expect(meta.areas).toEqual(splitTopology().areas)
    expect(topologyCardHelper.parseTopologyMeta(meta)).toEqual({ ...splitTopology(), packages: meta.packages })
  })

  test('the card names each app package and adds the apps table', () => {
    const card = topologyCardHelper.renderTopologyCard(splitTopology())
    expect(card.startsWith(LEGACY_CARD.replace('| queues: mail, reports |', '| — |'))).toBe(true)
    expect(card).toContain('| `sources/admin-web` | web, frontend | bundle | common | app: admin |')
    expect(card).toContain('## Apps')
    expect(card).toContain('| main | `/` | guest (/), user (/frontoffice) | `sources/web` | `sources/api` |')
    expect(card).toContain('| admin | `/admin` | admin (/admin) | `sources/admin-web` | `sources/admin-api` |')
    expect(card).toContain('| backoffice | `/backoffice` | operator (/backoffice) | `sources/backoffice-web` | `sources/backoffice-api` |')
    expect(card.endsWith('|\n')).toBe(true)
  })

  test('an invalid app list reads as no apps — packages stay', () => {
    const reserved = SPLIT_YAML.replace('mount: admin\n    areas:', 'mount: api\n    areas:')
    const parsed = topologyCardHelper.parseTopologyFile(fileOf(reserved))
    expect(parsed?.apps).toBeUndefined()
    expect(parsed?.areas).toBeUndefined()
    expect(parsed?.packages.map(pkg => pkg.name)).toContain('admin-web')

    const unshaped = SPLIT_YAML.replace('    index: 2\n', '    index: two\n')
    expect(topologyCardHelper.parseTopologyFile(fileOf(unshaped))?.apps).toBeUndefined()
    expect(appMapHelper.fromTopology(topologyCardHelper.parseTopologyFile(fileOf(unshaped)))).toEqual(appMapHelper.legacy().apps)
  })

  test('a package\'s app and mount are kept only when well-formed', () => {
    const parsed = topologyCardHelper.parseTopologyMeta({
      dir: 'sources', packages: [{ name: 'x-web', roles: ['web'], app: 'My App', mount: 'a/b' }],
    })
    expect(parsed?.packages[0]).toEqual({ name: 'x-web', roles: ['web'], kind: 'bundle', dependsOn: [] })
  })

  test('the map is compared: a changed binding is a changed record', () => {
    const moved = splitTopology()
    moved.apps = moved.apps!.map(app => app.name === 'admin' ? { ...app, index: 3 } : app)
    expect(topologyHelper.sameTopology(splitTopology(), moved)).toBe(false)
    expect(topologyHelper.sameTopology(splitTopology(), splitTopology())).toBe(true)
  })
})

describe('viable-common - the frontmatter reader', () => {
  test('reads what the writer emits, and nothing when there is no block', () => {
    expect(topologyCardHelper.frontmatterOf(fileOf(LEGACY_YAML))).toEqual({
      ...LEGACY_TOPOLOGY_WITH_QUEUES, version: 1, updatedAt: '2026-10-01T09:30:00.000Z',
    })
    expect(topologyCardHelper.frontmatterOf('# Topology\n')).toBeNull()
    expect(topologyCardHelper.frontmatterOf(`\uFEFF\n${fileOf('id: x\r\ndir: sources')}`.replace(/\n/g, '\r\n'))).toEqual({ id: 'x', dir: 'sources' })
    // An unreadable block is no record — never a throw.
    expect(topologyCardHelper.frontmatterOf(fileOf('apps: [ {'))).toBeNull()
    expect(topologyCardHelper.parseTopologyFile(fileOf('apps: *alias'))).toBeNull()
  })

  test('the YAML subset: scalars, quotes, flow and block collections, folding, block scalars, comments', () => {
    const doc = [
      '# a comment',
      'plain: word word   # trailing comment',
      'url: http://example.com:8080/x',
      '"quoted key": \'it\'\'s\'',
      'double: "tab\\tquote\\" \\u00fc"',
      'numbers: [1, -2, 1.5, 1e3, 0x1F, 0o17]',
      'specials: [~, null, true, False, "true", \'123\', ""]',
      'flow: {a: 1, b: [x, "y, z"], c: {}}',
      'nested:',
      '- a',
      '- b: 2',
      '  c: [ ]',
      '-',
      '  - deep',
      'folded: one two',
      '  three',
      'literal: |',
      '  keep',
      '    indented',
      '',
      '  done',
      'strip: >-',
      '  one',
      '  two',
      '',
      '  three',
      'empty:',
    ].join('\n')
    expect(yamlUtils.parse(doc)).toEqual({
      plain: 'word word',
      url: 'http://example.com:8080/x',
      'quoted key': 'it\'s',
      double: 'tab\tquote" ü',
      numbers: [1, -2, 1.5, 1000, 31, 15],
      specials: [null, null, true, false, 'true', '123', ''],
      flow: { a: 1, b: ['x', 'y, z'], c: {} },
      nested: ['a', { b: 2, c: [] }, ['deep']],
      folded: 'one two three',
      literal: 'keep\n  indented\n\ndone\n',
      strip: 'one two\nthree',
      empty: null,
    })
  })

  test('refuses what it does not understand rather than guessing', () => {
    for (const bad of ['a: &x 1', 'a: *x', 'a: !!str 1', '? a\n: b', 'a: 1\na: 2', '__proto__: 1', 'a:\n\t- x', 'a: "open', 'a: [1, 2', 'a: 1\n  b: 2']) {
      expect(() => yamlUtils.parse(bad)).toThrow()
    }
  })
})
