import { afterAll, describe, expect, test } from 'bun:test'
import { lint } from '@google/design.md/linter'
import { createPageFetcher, makeDesignAnalyst, makePageModel, renderDesignMd } from '../src/index.js'
import type { LlmModel } from '@owlmeans/llm'
import type { DesignDraft, DesignFacts, ReaderModels } from '../src/index.js'
import { startSite } from './servers.js'

const site = startSite()
afterAll(() => site.stop())

const fetcher = createPageFetcher({ allowHosts: ['127.0.0.1'] })
/** Facts are measured without a model; a model that is never called stands in. */
const unused = new Proxy({}, { get: () => () => { throw new Error('no model call expected') } }) as LlmModel
const models: ReaderModels = { model: () => unused, helper: () => undefined }

const factsOf = async (path: string): Promise<DesignFacts> => {
  const fetched = await fetcher.fetch({ url: `${site.url}${path}` })
  return makeDesignAnalyst(makePageModel({ url: fetched.finalUrl, html: fetched.text!, fetched }), { models, fetcher }).facts()
}

describe('@owlmeans/llm-reader — design facts', () => {
  test('the linked stylesheet is fetched and parsed; custom properties resolve', async () => {
    const facts = await factsOf('/')

    expect(facts.source).toBe('static')
    expect(facts.stylesheets).toEqual([{ url: `${site.url}/styles/site.css`, ok: true, bytes: expect.any(Number) }])
    expect(facts.variables).toContainEqual({ name: '--color-primary', value: '#0b5fff' })
  }, 10_000)

  test('colors are weighted by use on this page; unused utility rules say nothing', async () => {
    const facts = await factsOf('/')
    const primary = facts.colors.find(color => color.value === '#0b5fff')!

    expect(primary.accent).toBeGreaterThan(0)
    expect(facts.colors.find(color => color.value === '#1a1c1e')!.text).toBeGreaterThan(0)
    expect(facts.colors.some(color => color.value === '#ff00ff' || color.value === '#00ff00')).toBe(false)
  }, 10_000)

  test('type scale, spacing, radii, shadows, breakpoints and components are measured', async () => {
    const facts = await factsOf('/')
    const role = (name: string) => facts.typeScale.find(type => type.role === name)

    expect(role('h1')).toMatchObject({ fontFamily: 'Fraunces', fontSize: '3rem', fontWeight: '700', lineHeight: '1.1' })
    expect(role('body')).toMatchObject({ fontFamily: 'Inter', fontSize: '16px' })
    expect(facts.fonts[0]!.family).toBe('Inter')
    expect(facts.spacing.map(s => s.value)).toEqual(expect.arrayContaining(['16px', '24px']))
    expect(facts.radii.map(r => r.value)).toEqual(expect.arrayContaining(['8px', '16px', '9999px']))
    expect(facts.shadows[0]!.value).toContain('rgba(16, 24, 40')
    expect(facts.breakpoints).toEqual(['768px', '1200px'])
    expect(facts.components.find(c => c.name === 'button-primary')!.declarations).toMatchObject({ background: '#0b5fff', color: '#ffffff' })
    expect(facts.components.find(c => c.name === 'card')!.declarations['border-radius']).toBe('16px')
  }, 10_000)

  test('key blocks are told apart from the markup', async () => {
    const kinds = (await factsOf('/')).blocks.map(block => block.kind)
    expect(kinds).toEqual(['header', 'hero', 'logos', 'features', 'pricing', 'testimonial', 'footer'])
  }, 10_000)
})

describe('@owlmeans/llm-reader — DESIGN.md rendering', () => {
  const draft: DesignDraft = {
    name: 'Ledgerly',
    description: 'Calm, confident billing software for small studios.',
    colors: [
      { name: 'Primary', value: '#0b5fff', role: 'actions' },
      { name: 'ink', value: 'rgb(26, 28, 30)', role: 'text' },
      { name: 'surface', value: '#ffffff', role: 'cards' },
      { name: 'canvas', value: '#f6f7f9', role: 'page' },
      { name: 'broken', value: 'not-a-color', role: '?' },
    ],
    typography: [
      { name: 'h1', fontFamily: '"Fraunces", Georgia, serif', fontSize: '3rem', fontWeight: '700', lineHeight: '1.1', letterSpacing: '-0.02em' },
      { name: 'body md', fontFamily: 'Inter', fontSize: '16', fontWeight: '400', lineHeight: '1.6', letterSpacing: '' },
      { name: 'label', fontFamily: 'Inter', fontSize: '1rem', fontWeight: '600', lineHeight: '', letterSpacing: '' },
    ],
    rounded: [{ name: 'md', value: '8px' }, { name: 'lg', value: '16px' }, { name: 'full', value: '9999px' }],
    spacing: [{ name: 'sm', value: '8px' }, { name: 'md', value: '16px' }, { name: 'lg', value: '24px' }],
    components: [
      { name: 'button-primary', backgroundColor: '#0B5FFF', textColor: '{colors.surface}', typography: '{typography.label}', rounded: '{rounded.md}', padding: '12px 24px', size: '', height: '', width: '' },
      { name: 'card', backgroundColor: '{colors.surface}', textColor: '{colors.ink}', typography: '', rounded: '{rounded.lg}', padding: '24px', size: '', height: '', width: '' },
      { name: 'ghost', backgroundColor: '{colors.missing}', textColor: '', typography: '', rounded: '', padding: '', size: '', height: '', width: '' },
    ],
    sections: {
      overview: 'Quiet, generous, trustworthy.', colors: 'One blue drives every action.', typography: 'A serif display over a neutral sans.',
      layout: 'Centered hero, three-up feature cards.', elevation: 'Soft card shadows only.', shapes: '8px controls, 16px cards.',
      components: 'Filled primary, outlined secondary buttons.', dosAndDonts: '- Do keep one primary action per view.',
      responsive: 'Header padding grows at 768px; hero at 1200px.', agentGuide: 'Use the primary blue for the single main action.',
    },
  }
  const facts = { colors: [], typeScale: [], spacing: [], radii: [], shadows: [], breakpoints: [], components: [], blocks: [], variables: [], fonts: [], fontsLoaded: [], stylesheets: [], source: 'static' } as DesignFacts

  test('front matter and sections follow the spec; values are checked, references resolved', () => {
    const { markdown, tokens, warnings } = renderDesignMd(draft, facts)

    expect(markdown).toStartWith('---\nversion: "alpha"\nname: "Ledgerly"')
    expect(tokens.colors).toEqual({ primary: '#0B5FFF', ink: '#1A1C1E', surface: '#FFFFFF', canvas: '#F6F7F9' })
    expect(tokens.typography['body-md']).toEqual({ fontFamily: 'Inter', fontSize: '16px', fontWeight: 400, lineHeight: 1.6 })
    expect(tokens.typography.h1!.fontFamily).toBe('Fraunces')
    // A literal equal to a palette color becomes a reference; a dangling reference is dropped.
    expect(tokens.components['button-primary']!.backgroundColor).toBe('{colors.primary}')
    expect(tokens.components.ghost).toBeUndefined()
    expect(warnings.some(w => w.includes('broken'))).toBe(true)
    expect(warnings.some(w => w.includes('{colors.missing}'))).toBe(true)
    const headings = markdown.split('\n').filter(line => line.startsWith('## '))
    expect(headings).toEqual([
      '## Overview', '## Colors', '## Typography', '## Layout', '## Elevation & Depth', '## Shapes', '## Components',
      "## Do's and Don'ts", '## Responsive Behavior', '## Agent Prompt Guide',
    ])
  })

  test('the official linter finds no error and no section-order problem', () => {
    const result = lint(renderDesignMd(draft, facts).markdown)

    expect(result.summary.errors).toBe(0)
    expect(result.findings.filter(finding => finding.rule === 'section-order' || finding.rule === 'broken-ref')).toEqual([])
  })

  test('without a drafted primary the most used accent is named primary', () => {
    const { tokens, warnings } = renderDesignMd({ ...draft, colors: draft.colors.slice(1) }, {
      ...facts, colors: [{ value: '#0b5fff', text: 0, background: 0, border: 0, accent: 12, sources: ['.btn-primary'] }],
    })
    expect(tokens.colors.primary).toBe('#0B5FFF')
    expect(warnings.some(w => w.includes('primary'))).toBe(true)
  })
})
