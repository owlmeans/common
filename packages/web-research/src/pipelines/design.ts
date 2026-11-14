import { join } from 'node:path'
import { makePipeline } from '@owlmeans/agent'
import type { PipelineModel } from '@owlmeans/agent'
import { CollectKind } from '@owlmeans/llm-reader'
import { logger } from '@owlmeans/log'
import { DesignStep, ResearchGapCode } from '../consts.js'
import { makeDesignAnalyzer } from '../design.js'
import type { DesignAnalysis } from '../design/types.js'
import { ResearchConfigError } from '../errors.js'
import type { ResearchDeps, ResearchGap } from '../types.js'
import { textUtils } from '../utils/text.js'
import { urlUtils } from '../utils/url.js'
import { BRAND_PLACEHOLDER, DESIGN_ANALYSIS_FILE, DESIGN_PROSE_SECTIONS, designSpec } from './design/consts.js'
import type { DesignStepImpl as Step } from './design/types.local.js'
import type { DesignCollected, DesignInput, DesignOutput, DesignState } from './design/types.js'
import type { ResearchKit } from './types.local.js'

const log = logger('web-research:design')

/** `research:design`. The cleanup removes only what this run cloned — never a caller's `bundleRoot`. */
export const makeDesignPipeline = (kit: ResearchKit): PipelineModel<DesignState, ResearchDeps> => {
  const { wiring } = kit
  const stamp = (): string => new Date().toISOString()

  /** Each brand name replaced, whole words, case-insensitively. */
  const scrub = (text: string, names: readonly string[]): string => names
    .filter(name => name.length >= 3)
    .sort((a, b) => b.length - a.length)
    .reduce((current, name) => current.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), BRAND_PLACEHOLDER), text)

  const prose = (markdown: string, section: string): string => {
    const match = new RegExp(`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(markdown)
    return match?.[1]?.trim() ?? ''
  }

  const render = (analysis: DesignAnalysis, input: DesignInput): string => {
    const names = analysis.marks.names
    const { tokens } = analysis
    const table = (head: string[], rows: string[][]): string => rows.length === 0
      ? 'Not measured.'
      : [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(row => `| ${row.map(cell => cell.replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n')
    const components = Object.entries(tokens.components)
      .map(([name, props]) => `- **${name}**: ${Object.entries(props).map(([key, value]) => `${key} ${value}`).join(', ')}`)
    const scales = [
      `- Spacing: ${Object.entries(tokens.spacing).map(([name, value]) => `${name} ${value}`).join(', ') || 'not measured'}`,
      `- Corners: ${Object.entries(tokens.rounded).map(([name, value]) => `${name} ${value}`).join(', ') || 'not measured'}`,
    ]
    const blocks = analysis.outline.blocks.map(block => `${block.order}. **${block.role}** — ${scrub(block.summary, names)}`)
    const headings = analysis.outline.headings.map(heading => `${'  '.repeat(Math.max(0, heading.level - 1))}- ${scrub(textUtils.line(heading.text, 120), names)}`)
    const look = DESIGN_PROSE_SECTIONS.map(section => [section, scrub(prose(analysis.markdown, section), names)] as const)
      .filter(([, text]) => text !== '')

    return [
      '# Design reference',
      `Taken from ${analysis.url} as a style reference — its look only. The names, logos and marks listed last belong to its owner and are never reused.`,
      ...(input.instruction != null && input.instruction.trim() !== '' ? ['## What to take from it', textUtils.cap(input.instruction.trim(), kit.limits.instructionChars)] : []),
      '## Palette',
      table(['Token', 'Value'], Object.entries(tokens.colors).map(([name, value]) => [name, value])),
      '## Typography',
      table(['Level', 'Family', 'Size', 'Weight', 'Line height', 'Tracking'], Object.entries(tokens.typography).map(([name, style]) => [
        name, String(style.fontFamily ?? ''), String(style.fontSize ?? ''), String(style.fontWeight ?? ''), String(style.lineHeight ?? ''), String(style.letterSpacing ?? ''),
      ])),
      ...(analysis.fonts.length > 0 ? [`Fonts the page loads: ${analysis.fonts.join(', ')}.`] : []),
      '## Spacing and shapes',
      scales.join('\n'),
      '## Components',
      components.length > 0 ? components.join('\n') : 'None measured.',
      '## Layout and blocks',
      blocks.length > 0 ? blocks.join('\n') : 'No blocks identified.',
      ...(headings.length > 0 ? ['Headings, in order:', headings.join('\n')] : []),
      ...(look.length > 0 ? ['## Look and feel', ...look.map(([section, text]) => `**${section}.** ${text}`)] : []),
      '## Brand marks — do not reuse',
      [
        `- Names: ${names.length > 0 ? names.join(', ') : 'none found'}`,
        `- Logos: ${analysis.marks.logos.length > 0 ? analysis.marks.logos.map(logo => `${logo.url}${logo.alt != null ? ` (${logo.alt})` : ''}`).join(', ') : 'none found'}`,
        `- Icons: ${analysis.marks.icons.length > 0 ? analysis.marks.icons.join(', ') : 'none found'}`,
      ].join('\n'),
    ].join('\n\n') + '\n'
  }

  const collect: Step = {
    step: DesignStep.Collect,
    skipWhen: async (state, ctx) => state.collectAt != null || await kit.area(ctx.runId).step(DesignStep.Collect) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const { input } = state
      let record: DesignCollected
      if (input.bundleRoot != null && input.bundleRoot !== '') {
        record = { bundleRoot: input.bundleRoot, files: 0, ...(input.entry != null ? { entry: input.entry } : {}) }
      } else if (input.url != null && input.url !== '') {
        const bundle = area.path('bundle')
        try {
          const result = await wiring.reader.collect(input.url, {
            sink: wiring.store.sources.sink(), prefix: bundle, limits: kit.limits.designCollect, timeout: kit.limits.collectTimeoutMs,
            signal: ctx.signal, ...(ctx.deps.key != null ? { key: ctx.deps.key } : {}),
          })
          record = result.kind === CollectKind.Bundle && result.entry != null
            ? { bundle, files: result.files }
            : { files: result.files, error: result.items.find(item => item.reason != null)?.reason ?? `not-a-page:${result.kind}` }
        } catch (error) {
          ctx.signal.throwIfAborted()
          log.warn('Design page not collected', { url: urlUtils.loggable(input.url), error })
          record = { files: 0, error: (error as Error).message }
        }
      } else {
        throw new ResearchConfigError('design:no-url-or-bundle')
      }
      await area.saveStep(DesignStep.Collect, record)
      return { collectAt: stamp(), files: record.files }
    },
  }

  const analyze: Step = {
    step: DesignStep.Analyze,
    skipWhen: async (state, ctx) => state.analyzeAt != null || await kit.area(ctx.runId).step(DesignStep.Analyze) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const collected = await area.step<DesignCollected>(DesignStep.Collect)
      if (collected == null || (collected.bundle == null && collected.bundleRoot == null)) {
        await area.saveStep(DesignStep.Analyze, { analyzed: false })
        return { analyzeAt: stamp() }
      }
      const root = collected.bundleRoot ?? join(await wiring.store.sources.localRoot(), ...collected.bundle!.split('/'))
      const models = wiring.models.reader()
      const analysis = await makeDesignAnalyzer({
        ...(models != null ? { models } : {}), ...(wiring.renderer != null ? { renderer: wiring.renderer } : {}),
      }).analyze({ root, ...(collected.entry != null ? { entry: collected.entry } : {}) })
      await area.write(DESIGN_ANALYSIS_FILE, analysis)
      if (state.input.outputs.designMd != null) await wiring.store.outputs.writeDoc(state.input.outputs.designMd, analysis.markdown)
      if (state.input.outputs.tokens != null) await wiring.store.outputs.writeDoc(state.input.outputs.tokens, JSON.stringify(analysis.tokens, null, 2))
      await area.saveStep(DesignStep.Analyze, { analyzed: true, by: analysis.by, rendered: analysis.rendered })
      ctx.report(`design read (${analysis.by})`)
      return { analyzeAt: stamp(), by: analysis.by, rendered: analysis.rendered }
    },
  }

  const pack: Step = {
    step: DesignStep.Pack,
    skipWhen: async (state, ctx) => state.packAt != null || await kit.area(ctx.runId).step(DesignStep.Pack) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const collected = await area.step<DesignCollected>(DesignStep.Collect)
      const analysis = await area.read<DesignAnalysis>(DESIGN_ANALYSIS_FILE)
      const gaps: ResearchGap[] = []
      if (collected?.error != null) gaps.push({ code: ResearchGapCode.SourceFailed, subject: state.input.url ?? '', detail: collected.error })
      if (analysis == null) {
        const output: DesignOutput = { gaps: kit.sources.cap(gaps) }
        await area.saveStep(DesignStep.Pack, { output })
        return { packAt: stamp(), output }
      }
      if (analysis.by === 'facts') gaps.push({ code: ResearchGapCode.DesignByFacts, subject: analysis.url })
      if (analysis.warnings.includes('not-rendered')) gaps.push({ code: ResearchGapCode.NotRendered, subject: analysis.url })
      await wiring.store.outputs.writeDoc(state.input.outputs.doc, render(analysis, state.input))
      const output: DesignOutput = {
        doc: state.input.outputs.doc, url: analysis.url, by: analysis.by, rendered: analysis.rendered, marks: analysis.marks,
        gaps: kit.sources.cap(gaps),
      }
      await area.saveStep(DesignStep.Pack, { output })
      return { packAt: stamp(), output }
    },
  }

  const cleanup: Step = {
    step: DesignStep.Cleanup,
    skipWhen: async (state, ctx) => state.cleanupAt != null
      || (state.output != null && (await wiring.store.sources.list(kit.area(ctx.runId).prefix)).length === 0),
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const output = state.output ?? (await area.step<{ output: DesignOutput }>(DesignStep.Pack))?.output ?? { gaps: [] }
      await ctx.mark({ output })
      // Only the run's own area: a caller's bundle lives outside it.
      await area.clear()
      return { cleanupAt: stamp(), output }
    },
  }

  return makePipeline<DesignState, ResearchDeps>(designSpec, { ...kit.runner, steps: [collect, analyze, pack, cleanup] })
}
