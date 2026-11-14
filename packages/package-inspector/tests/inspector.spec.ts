import { describe, expect, test } from 'bun:test'
import { createPackageInspector, PackageReason, PackageVerdictKind, ReasonEffect } from '../src/index.js'
import type { PackageInspectorThresholds } from '../src/index.js'
import { makeRecordedRegistry } from './context.js'
import type { RecordedRegistry } from './context.js'
import { NOW, RECORDS } from './fixtures.js'

const inspectorOf = (registry: RecordedRegistry = makeRecordedRegistry(RECORDS), thresholds?: Partial<PackageInspectorThresholds>) =>
  createPackageInspector({ registry, thresholds, now: () => NOW })

describe('@owlmeans/package-inspector — inspect', () => {
  test('a lookalike of a far more popular near name is suspicious, its copied description too', async () => {
    const inspector = inspectorOf()

    const loadsh = await inspector.inspect(' loadsh ')
    expect(loadsh.verdict).toBe(PackageVerdictKind.Suspicious)
    expect(loadsh.lookalikeOf).toBe('lodash')
    expect(loadsh.reasons).toEqual([
      PackageReason.Lookalike, PackageReason.CopiedDescription, PackageReason.RepositoryMismatch, PackageReason.Deprecated,
    ])
    expect(loadsh.findings[0]).toEqual({
      reason: PackageReason.Lookalike, effect: ReasonEffect.Blocking, detail: 'imitates lodash: 199506230 weekly downloads against 13852',
    })
    expect(loadsh.downloads).toBe(13_852)
    expect(loadsh.docs).toEqual({ homepage: 'https://lodash.com/', repository: 'https://github.com/lodash/lodash', readme: true })

    const lodas = await inspector.inspect('lodas')
    expect([lodas.verdict, lodas.lookalikeOf, lodas.reasons]).toEqual([
      PackageVerdictKind.Suspicious, 'lodash', [PackageReason.Lookalike, PackageReason.LowDownloads],
    ])

    // Scoped names: the scope stripped, and the scope itself mistyped.
    expect((await inspector.inspect('@acme/lodash')).lookalikeOf).toBe('lodash')
    const tyeps = await inspector.inspect('@tyeps/node')
    expect([tyeps.verdict, tyeps.lookalikeOf]).toEqual([PackageVerdictKind.Suspicious, '@types/node'])
    expect(tyeps.reasons).toContain(PackageReason.CopiedDescription)
  })

  test('an unknown name is unknown with the name it likely misspells; placeholders and withdrawn packages are suspicious', async () => {
    const inspector = inspectorOf()

    const missing = await inspector.inspect('lodsah')
    expect([missing.verdict, missing.reasons, missing.lookalikeOf, missing.facts]).toEqual([
      PackageVerdictKind.Unknown, [PackageReason.NotFound], 'lodash', null,
    ])
    expect(missing.docs).toEqual({ readme: false })
    expect((await inspector.inspect('zq-nothing-here-4821')).lookalikeOf).toBeUndefined()

    const momnet = await inspector.inspect('momnet')
    expect([momnet.verdict, momnet.lookalikeOf]).toEqual([PackageVerdictKind.Suspicious, 'moment'])
    expect(momnet.reasons).toEqual([PackageReason.Holding, PackageReason.Lookalike, PackageReason.LowDownloads])

    const gone = await inspector.inspect('acme-gone')
    expect([gone.verdict, gone.downloads]).toEqual([PackageVerdictKind.Suspicious, null])
    expect(gone.reasons).toEqual([PackageReason.Unpublished, PackageReason.LowDownloads, PackageReason.NoRepository])
  })

  test('young + hardly used + install scripts block together; a repository naming another package blocks', async () => {
    const registry = makeRecordedRegistry(RECORDS)
    const inspector = inspectorOf(registry)

    const risky = await inspector.inspect('acme-color-utilz')
    expect(risky.verdict).toBe(PackageVerdictKind.Suspicious)
    expect(risky.findings.map(entry => [entry.reason, entry.effect])).toEqual([
      [PackageReason.Young, ReasonEffect.Blocking], [PackageReason.LowDownloads, ReasonEffect.Blocking],
      [PackageReason.InstallScripts, ReasonEffect.Blocking],
    ])
    const fresh = await inspector.inspect('acme-fresh-helper')
    expect([fresh.verdict, fresh.reasons]).toEqual([PackageVerdictKind.Genuine, [PackageReason.Young, PackageReason.LowDownloads]])
    expect(fresh.findings[0].detail).toBe('first published 3 days ago')

    const mismatch = await inspector.inspect('acme-quick-format')
    expect([mismatch.verdict, mismatch.reasons, mismatch.lookalikeOf]).toEqual([
      PackageVerdictKind.Suspicious, [PackageReason.RepositoryMismatch], undefined,
    ])
    // A workspace root naming the monorepo is no evidence; a popular package is not asked at all.
    expect((await inspector.inspect('acme-widgets-ui')).verdict).toBe(PackageVerdictKind.Genuine)
    const popular = await inspector.inspect('acme-popular')
    expect([popular.verdict, popular.reasons]).toEqual([PackageVerdictKind.Genuine, [PackageReason.InstallScripts, PackageReason.Popular]])
    expect(registry.calls.filter(call => call.startsWith('repositoryManifest:') && call.includes('acme-popular'))).toEqual([])
  })

  test('a popular package with provenance is genuine, with its documentation links and the intent carried', async () => {
    const inspector = inspectorOf()

    const dayjs = await inspector.inspect('dayjs', { intent: 'dates' })
    expect(dayjs).toMatchObject({
      name: 'dayjs', registry: 'recorded', verdict: PackageVerdictKind.Genuine, reasons: [PackageReason.Provenance, PackageReason.Popular],
      downloads: 107_776_160, intent: 'dates',
      docs: { homepage: 'https://day.js.org', repository: 'https://github.com/iamkun/dayjs', readme: true },
    })
    expect(dayjs.lookalikeOf).toBeUndefined()
    expect(dayjs.facts?.latest).toBe('1.11.23')
    expect((await inspector.inspect('@types/node')).verdict).toBe(PackageVerdictKind.Genuine)
  })

  test('thresholds move the lines', async () => {
    const copiedOnly = await inspectorOf(undefined, { lookalikeRatio: 20_000 }).inspect('loadsh')
    expect([copiedOnly.verdict, copiedOnly.lookalikeOf, copiedOnly.reasons]).toEqual([
      PackageVerdictKind.Suspicious, 'lodash', [PackageReason.CopiedDescription, PackageReason.RepositoryMismatch, PackageReason.Deprecated],
    ])

    const spared = await inspectorOf(undefined, { popularDownloads: 10_000 }).inspect('loadsh')
    expect([spared.verdict, spared.reasons]).toEqual([PackageVerdictKind.Genuine, [PackageReason.Deprecated, PackageReason.Popular]])

    const strict = inspectorOf(undefined, { minTargetDownloads: 500_000_000, nearDistance: 0, youngDays: 1 })
    expect(strict.thresholds.lookalikeRatio).toBe(100)
    expect((await strict.inspect('loadsh')).reasons).toEqual([PackageReason.Deprecated])
    expect((await strict.inspect('acme-color-utilz')).verdict).toBe(PackageVerdictKind.Genuine)
  })
})

describe('@owlmeans/package-inspector — inspectAll and an unreachable registry', () => {
  test('verdicts in request order, each name inspected once, at most `concurrency` at a time', async () => {
    const registry = makeRecordedRegistry(RECORDS)
    const inspector = createPackageInspector({ registry, concurrency: 2, now: () => NOW })

    const verdicts = await inspector.inspectAll(['dayjs', { name: 'loadsh', intent: 'collections' }, { name: 'dayjs', intent: 'dates' }, 'momnet'])
    expect(verdicts.map(verdict => [verdict.name, verdict.verdict, verdict.intent])).toEqual([
      ['dayjs', PackageVerdictKind.Genuine, undefined], ['loadsh', PackageVerdictKind.Suspicious, 'collections'],
      ['dayjs', PackageVerdictKind.Genuine, 'dates'], ['momnet', PackageVerdictKind.Suspicious, undefined],
    ])
    expect(registry.calls.filter(call => call === 'manifest:dayjs')).toHaveLength(1)
    expect(registry.peak()).toBe(2)
  })

  test('a registry that cannot be asked yields unknown; a failing repository host is inconclusive', async () => {
    const noCounts = await inspectorOf(makeRecordedRegistry(RECORDS, 'downloads')).inspect('dayjs')
    expect([noCounts.verdict, noCounts.reasons, noCounts.facts?.name]).toEqual([PackageVerdictKind.Unknown, [PackageReason.Unavailable], 'dayjs'])
    expect(noCounts.findings[0].detail).toBe('the recorded registry could not be asked')

    const noFacts = await inspectorOf(makeRecordedRegistry(RECORDS, 'manifest')).inspect('dayjs')
    expect([noFacts.verdict, noFacts.facts]).toEqual([PackageVerdictKind.Unknown, null])

    const noRepository = await inspectorOf(makeRecordedRegistry(RECORDS, 'repositoryManifest')).inspect('loadsh')
    expect(noRepository.verdict).toBe(PackageVerdictKind.Suspicious)
    expect(noRepository.reasons).not.toContain(PackageReason.RepositoryMismatch)
  })
})
