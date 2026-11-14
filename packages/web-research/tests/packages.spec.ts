import { afterAll, describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import { PackageReason, PackageVerdictKind } from '@owlmeans/package-inspector'
import { makeResearchPipelines, ResearchGapCode } from '../src/index.js'
import { localReader, packageInspector, runStore, scriptedResearch, tempStore } from './context.js'
import { startDocsSite } from './servers.js'

const docs = startDocsSite()
afterAll(() => docs.stop())

const NOTES = '## Install\n```sh\nnpm install tinydate\n```\n[1][3]\n\n## Imports\n```ts\nimport tinydate from \'tinydate\'\n```\nA default export [3].\n\n## Core API\n`tinydate(pattern: string): (date?: Date) => string` [4].\n\n## Usage\n```ts\nconst stamp = tinydate(\'{YYYY}-{MM}-{DD}\')\nstamp(new Date())\n```\n[1]\n\n## Configuration\nCustom dictionaries through `tinydate.with(dict)` [5].\n\n## Pitfalls and breaking changes\nv2 removed the options argument [5].'

describe('web-research — research:packages', () => {
  test('verifies every package; reads, screens and writes notes for the genuine one only', async () => {
    const temp = await tempStore()
    const { models, scripted } = scriptedResearch([{ content: NOTES }])
    const pipelines = makeResearchPipelines({
      models, store: temp.store, reader: localReader(), inspector: packageInspector(`${docs.url}/`), runs: runStore(), limits: { crawlDelayMs: 0 },
    })

    const result = await pipelines.packages.invoke({
      input: {
        packages: [{ name: 'tinydate', intent: 'format dates' }, { name: 'tinydaet' }], context: 'A React + Bun dashboard.',
        outputs: { doc: 'research/packages.md', notesDir: 'skills/notes' },
      },
    }, { runId: 'packages-1', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(scripted.turns()).toBe(1)
    expect(result.state).toMatchObject({ inspected: 2, genuine: 1, written: 1 })
    expect(docs.hits).toEqual(expect.arrayContaining(['/', '/install', '/api', '/migration']))
    const output = result.state.output!
    expect(output.verdicts).toEqual([
      expect.objectContaining({ name: 'tinydate', verdict: PackageVerdictKind.Genuine, latest: '2.1.0' }),
      expect.objectContaining({ name: 'tinydaet', verdict: PackageVerdictKind.Suspicious, lookalikeOf: 'tinydate', reasons: expect.arrayContaining([PackageReason.Lookalike]) }),
    ])
    expect(output.notes).toEqual([{ name: 'tinydate', doc: 'skills/notes/tinydate.md' }])
    expect(output.gaps).toContainEqual(expect.objectContaining({ code: ResearchGapCode.NotGenuine, subject: 'tinydaet' }))

    // The writer read the registry readme and the documentation site — and only the genuine package's.
    const asked = JSON.stringify(scripted.asked()[0])
    expect(asked).toContain('Current version: 2.1.0 (major 2)')
    expect(asked).toContain('tinydate readme')
    expect(asked).toContain('v2 removed the second options argument')
    expect(asked).toContain('A React + Bun dashboard.')
    // How the package is imported — its manifest's entry points and the readme's own import lines.
    expect(asked).toContain('Module system: CommonJS by default (no `\\"type\\"` field)')
    expect(asked).toContain('The package root is importable: `tinydate`')
    expect(asked).toContain("import 'tinydate/locale/de'")
    expect(asked).toContain('FIRST the canonical import of the package ROOT')

    const doc = (await temp.store.outputs.readDoc('research/packages.md'))!
    expect(doc).toContain('| tinydaet | suspicious |')
    expect(doc).toContain('did you mean tinydate?')
    expect(doc).toContain('## tinydate — usage notes')
    expect(doc).toContain('### Imports')
    const own = (await temp.store.outputs.readDoc('skills/notes/tinydate.md'))!
    expect(own).toStartWith('# tinydate — usage notes')
    // The package writes the entry points into the notes, ahead of the writer's text — the skill writer reads them there.
    expect(own).toContain('## Entry points (package manifest)\n\n- Module system: CommonJS by default (no `"type"` field)\n- main: `dist/tinydate.js`')
    expect(own.indexOf('## Entry points')).toBeLessThan(own.indexOf('## Install'))
    expect(own).toContain('## Sources')
    expect(await temp.store.sources.list()).toEqual([])
    await temp.dispose()
  }, 30_000)

  test('without an inspector nothing is judged, read or written', async () => {
    const temp = await tempStore()
    const { models, scripted } = scriptedResearch([{ content: 'never asked' }])
    const result = await makeResearchPipelines({ models, store: temp.store, reader: localReader() }).packages
      .invoke({ input: { packages: [{ name: 'tinydate' }], outputs: { doc: 'research/packages.md' } } }, { runId: 'packages-2', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(scripted.turns()).toBe(0)
    expect(result.state.output).toEqual({ verdicts: [], notes: [], gaps: [{ code: ResearchGapCode.InspectorUnavailable }] })
    expect(await temp.store.outputs.readDoc('research/packages.md')).toBeNull()
    await temp.dispose()
  }, 30_000)
})
