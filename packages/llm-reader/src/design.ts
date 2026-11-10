import { HumanMessage } from '@langchain/core/messages'
import type { JSONSchemaType } from 'ajv'
import { ReaderTask } from './consts.js'
import { textUtils } from './utils/text.js'
import type { PageModel } from './models/page/types.js'
import { DEFAULT_MAX_STYLESHEETS, DESIGN_INSTRUCTION } from './design/consts.js'
import { designFactsHelper } from './design/facts.js'
import { renderDesignMd } from './design/render.js'
import { DESIGN_SCHEMA } from './design/schemas.js'
import type { DesignAnalyst, DesignAnalystOptions, DesignDraft, DesignFacts } from './design/types.js'

/** The facts as the model reads them — compact, labelled, every value as measured. */
const factsText = (page: PageModel, facts: DesignFacts): string => {
  const meta = page.meta()
  const lines = [
    `# Design facts of ${page.url}`,
    `Site: ${meta.site?.value ?? ''} · Title: ${meta.title?.value ?? ''} · Measured from: ${facts.source === 'static' ? 'parsed CSS' : 'computed styles and parsed CSS'}`,
    '', '## Colors (weight by use: text / background / border / accent)',
    ...facts.colors.map(c => `- ${c.value}: ${c.text} / ${c.background} / ${c.border} / ${c.accent} · from ${c.sources.join(', ')}`),
    '', '## Fonts', ...facts.fonts.map(f => `- ${f.family} (weight ${f.weight})`),
    ...(facts.fontsLoaded.length > 0 ? [`Loaded: ${facts.fontsLoaded.join(', ')}`] : []),
    '', '## Type scale',
    ...facts.typeScale.map(t => `- ${t.role}: ${[t.fontFamily, t.fontSize, t.fontWeight && `weight ${t.fontWeight}`, t.lineHeight && `line-height ${t.lineHeight}`, t.letterSpacing && `tracking ${t.letterSpacing}`].filter(Boolean).join(', ')}`),
    '', `## Spacing (px, by use): ${facts.spacing.map(s => `${s.value}×${s.count}`).join(', ')}`,
    `## Radii: ${facts.radii.map(s => `${s.value}×${s.count}`).join(', ')}`,
    `## Shadows: ${facts.shadows.map(s => `${s.value} ×${s.count}`).join(' | ')}`,
    `## Breakpoints: ${facts.breakpoints.join(', ') || 'none found'}`,
    '', '## Components', ...facts.components.map(c => `- ${c.name}: ${Object.entries(c.declarations).map(([k, v]) => `${k}: ${v}`).join('; ')}`),
    '', '## Key blocks (top to bottom)', ...facts.blocks.map(b => `- ${b.kind}: ${b.summary}`),
    '', `## Custom properties (${facts.variables.length})`, ...facts.variables.slice(0, 60).map(v => `- ${v.name}: ${v.value}`),
  ]
  return lines.join('\n')
}

/**
 * One page read by a web designer. The facts are measured — linked stylesheets fetched through
 * the reader's fetcher (same proxy key as the page), CSS parsed and weighted by the DOM, computed
 * styles merged when the page was rendered — and the model only names, groups and explains what
 * was measured; the DESIGN.md itself is rendered by the package.
 */
export const makeDesignAnalyst = (page: PageModel, options: DesignAnalystOptions): DesignAnalyst => {
  const limit = options.maxStylesheets ?? DEFAULT_MAX_STYLESHEETS

  const facts: DesignAnalyst['facts'] = async (designOptions = {}) => {
    const urls = page.stylesheets().slice(0, limit)
    const fetched = await Promise.all(urls.map(async url => {
      try {
        const sheet = await options.fetcher.fetch({ url, purpose: 'stylesheet', ...(designOptions.key != null ? { key: designOptions.key } : {}) })
        return { url, ok: sheet.status < 400, bytes: sheet.text?.length ?? 0, text: sheet.status < 400 ? sheet.text ?? '' : '' }
      } catch {
        return { url, ok: false, bytes: 0, text: '' }
      }
    }))
    const measured = designFactsHelper.read(page, fetched.map(sheet => sheet.text), fetched.map(({ url, ok, bytes }) => ({ url, ok, bytes })))

    return page.rendered != null ? designFactsHelper.merge(measured, page.rendered) : measured
  }

  const analyze: DesignAnalyst['analyze'] = async (designOptions = {}) => {
    const measured = await facts(designOptions)
    const screenshot = page.rendered?.screenshot
    const input = screenshot != null
      ? [new HumanMessage({
        content: [
          { type: 'text', text: factsText(page, measured) },
          { type: 'text', text: 'Screenshot of the first viewport:' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(screenshot).toString('base64')}` } },
          { type: 'text', text: `${DESIGN_INSTRUCTION} Answer as JSON.` },
        ],
      })]
      : [{ role: 'user', content: factsText(page, measured) }, { role: 'user', content: DESIGN_INSTRUCTION }]
    const draft = await options.models.model(ReaderTask.Design).invoke<DesignDraft>(
      input, DESIGN_SCHEMA as unknown as JSONSchemaType<DesignDraft>, { action: 'reader-design', stable: screenshot != null ? 0 : 1 },
    )
    const { markdown, tokens, warnings } = renderDesignMd({ ...draft, name: draft.name || textUtils.siteOf(page.url) }, measured)

    return { markdown, tokens, facts: measured, warnings }
  }

  return { facts, analyze }
}
