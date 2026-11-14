import { describe, expect, test } from 'bun:test'
import { appendPackageInspector, ensurePackageInspectorService, PackageVerdictKind } from '../src/index.js'
import { makeRecordedRegistry, makeTestCtx } from './context.js'
import { NOW, RECORDS } from './fixtures.js'

describe('@owlmeans/package-inspector — the context host', () => {
  test('appendPackageInspector registers one inspector per registry id', async () => {
    const context = appendPackageInspector(makeTestCtx(), { registry: makeRecordedRegistry(RECORDS), now: () => NOW })
    const host = ensurePackageInspectorService(context)

    expect(ensurePackageInspectorService(context)).toBe(host)
    const inspector = host.get()
    expect(inspector?.registry).toBe('recorded')
    expect((await inspector?.inspect('loadsh'))?.verdict).toBe(PackageVerdictKind.Suspicious)

    const other = { ...makeRecordedRegistry(RECORDS), id: 'other' }
    appendPackageInspector(context, { registry: other, thresholds: { lookalikeRatio: 5 } })
    expect(host.get()).toBeNull()
    expect(host.get('other')?.thresholds.lookalikeRatio).toBe(5)
    appendPackageInspector(context, { registry: other })
    expect(host.list().map(entry => [entry.registry, entry.thresholds.lookalikeRatio])).toEqual([['recorded', 100], ['other', 100]])
  })
})
