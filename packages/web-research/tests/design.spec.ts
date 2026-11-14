import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import { CollectKind, createDirectoryCollectSink } from '@owlmeans/llm-reader'
import { makeDesignAnalyzer, makeResearchPipelines, ResearchGapCode } from '../src/index.js'
import { answer, localReader, runStore, scriptedResearch, tempStore } from './context.js'
import { startCdn, startDesignSite } from './servers.js'

const cdn = startCdn()
const site = startDesignSite(cdn.url)
afterAll(() => {
  site.stop()
  cdn.stop()
})

const field = (names: string[], values: Record<string, string> = {}) => Object.fromEntries(names.map(name => [name, values[name] ?? '']))

/** What llm-reader's design analyst asks the model for, answered. */
const DRAFT = answer({
  name: 'Northwind Studio', description: 'Calm teal product-studio design.',
  colors: [{ name: 'primary', value: '#0f766e', role: 'actions' }, { name: 'on-surface', value: '#0b1320', role: 'text' }, { name: 'surface', value: '#f8fafc', role: 'ground' }],
  typography: [
    { name: 'display', fontFamily: 'Manrope', fontSize: '48px', fontWeight: '800', lineHeight: '1.1', letterSpacing: '-0.02em' },
    { name: 'body-md', fontFamily: 'Manrope', fontSize: '16px', fontWeight: '400', lineHeight: '1.6', letterSpacing: '' },
  ],
  rounded: [{ name: 'md', value: '12px' }, { name: 'full', value: '999px' }],
  spacing: [{ name: 'md', value: '24px' }, { name: 'xl', value: '64px' }],
  components: [field(['name', 'backgroundColor', 'textColor', 'typography', 'rounded', 'padding', 'size', 'height', 'width'],
    { name: 'button-primary', backgroundColor: '{colors.primary}', textColor: '#ffffff', rounded: '{rounded.full}', padding: '12px 24px' })],
  sections: field(['overview', 'colors', 'typography', 'layout', 'elevation', 'shapes', 'components', 'dosAndDonts', 'responsive', 'agentGuide'], {
    overview: 'Northwind Studio looks calm: teal accents on a pale slate ground.',
    layout: 'A hero, three feature cards and a pricing card, generous section padding.',
    dosAndDonts: 'Keep teal for actions only.',
  }),
})

describe('web-research — research:design', () => {
  test('clones the page with its styles and web font, reads it offline, packs a style reference with the marks apart', async () => {
    const temp = await tempStore()
    const { models, scripted } = scriptedResearch([DRAFT])
    const pipelines = makeResearchPipelines({ models, store: temp.store, reader: localReader(), runs: runStore() })

    const result = await pipelines.design.invoke({
      input: { url: `${site.url}/`, instruction: 'Take the calm hero and the cards.', outputs: { doc: 'design/reference.md', designMd: 'design/DESIGN.md', tokens: 'design/tokens.json' } },
    }, { runId: 'design-1', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(scripted.turns()).toBe(1)
    expect(cdn.hits).toContain('/fonts/manrope.woff2')
    const output = result.state.output!
    expect(output).toMatchObject({ doc: 'design/reference.md', by: 'model', url: `${site.url}/` })
    expect(output.marks?.names).toContain('Northwind Studio')
    expect(output.marks?.logos[0]?.url).toBe(`${site.url}/img/logo.svg`)

    const doc = (await temp.store.outputs.readDoc('design/reference.md'))!
    const [style, marks] = doc.split('## Brand marks — do not reuse')
    expect(style).toContain('## Palette')
    expect(style).toContain('| primary | #0F766E |')
    expect(style).toContain('Manrope')
    expect(style).toContain('Fonts the page loads: Manrope')
    expect(style).toContain('**button-primary**')
    expect(style).toContain('## Layout and blocks')
    expect(style).toContain('Design that ships')
    expect(style).toContain('Take the calm hero and the cards.')
    expect(style).toContain('the reference brand looks calm')
    expect(style).not.toContain('Northwind')
    expect(marks).toContain('Northwind Studio')
    expect(marks).toContain(`${site.url}/img/logo.svg`)
    expect(await temp.store.outputs.readDoc('design/DESIGN.md')).toContain('## Overview')
    expect(JSON.parse((await temp.store.outputs.readDoc('design/tokens.json'))!).colors.primary).toBe('#0F766E')
    expect(await temp.store.sources.list()).toEqual([])
    await temp.dispose()
  }, 30_000)

  test('a caller\'s bundle is read in place and never removed; a failed write-up falls back to the measured facts', async () => {
    const temp = await tempStore()
    const bundleRoot = join(temp.root, 'upload')
    await mkdir(bundleRoot, { recursive: true })
    await writeFile(join(bundleRoot, 'index.html'), '<!doctype html><html><head><title>Ours</title><link rel="stylesheet" href="style.css"></head><body><header>Ours</header><main><section><h1>Hello</h1><a class="btn-primary" href="#">Go</a></section></main></body></html>')
    await writeFile(join(bundleRoot, 'style.css'), 'body { font-family: Georgia, serif; color: #222222; background: #fffdf7; } .btn-primary { background: #b4232c; color: #ffffff; border-radius: 6px; padding: 8px 16px; }')
    const { models, scripted } = scriptedResearch([{ error: 'model down' }])
    const pipelines = makeResearchPipelines({ models, store: temp.store, reader: localReader() })

    const result = await pipelines.design.invoke({ input: { bundleRoot, outputs: { doc: 'design/ours.md' } } }, { runId: 'design-2', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(scripted.turns()).toBe(1)
    expect(result.state.output).toMatchObject({ by: 'facts', gaps: [expect.objectContaining({ code: ResearchGapCode.DesignByFacts })] })
    const ours = (await temp.store.outputs.readDoc('design/ours.md'))!
    expect(ours).toContain('| primary | #B4232C |')
    expect(ours).toContain('- Names: none found')
    expect(ours).toContain('- Icons: none found')
    expect((await readdir(bundleRoot)).sort()).toEqual(['index.html', 'style.css'])
    await temp.dispose()
  }, 30_000)

  test('the analysis stage alone reads a collected bundle with every server gone', async () => {
    const temp = await tempStore()
    const ownCdn = startCdn()
    const ownSite = startDesignSite(ownCdn.url)
    const root = join(temp.root, 'bundle')
    const collected = await localReader().collect(`${ownSite.url}/`, { sink: createDirectoryCollectSink(root) })
    expect(collected.kind).toBe(CollectKind.Bundle)
    ownSite.stop()
    ownCdn.stop()

    const { models } = scriptedResearch([DRAFT])
    const analysis = await makeDesignAnalyzer({ models: models.reader() }).analyze({ root })

    expect(analysis.by).toBe('model')
    expect(analysis.url).toBe(`${ownSite.url}/`)
    expect(analysis.fonts).toContain('Manrope')
    expect(analysis.tokens.colors.primary).toBe('#0F766E')
    expect(analysis.outline.blocks.map(block => block.role)).toContain('header')
    expect(analysis.outline.headings[0]).toEqual({ level: 1, text: 'Design that ships' })
    expect(analysis.marks.icons).toContain(`${ownSite.url}/favicon.png`)
    await temp.dispose()
  }, 30_000)
})
