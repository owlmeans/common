import { makePipeline } from '@owlmeans/agent'
import type { PipelineModel } from '@owlmeans/agent'
import { logger } from '@owlmeans/log'
import { PROJECT_CRAWL_INTENT, ProjectStep, ResearchGapCode, ResearchRole } from '../consts.js'
import type { ResearchDeps, ResearchGap } from '../types.js'
import { textUtils } from '../utils/text.js'
import { urlUtils } from '../utils/url.js'
import { SUMMARIZE_INSTRUCTION, projectSpec } from './project/consts.js'
import type { ProjectStepImpl as Step } from './project/types.local.js'
import type { ProjectCrawl, ProjectInput, ProjectOutput, ProjectState } from './project/types.js'
import type { ResearchKit } from './types.local.js'

const log = logger('web-research:project')

/** `research:project` — the same two guards on every step as implementation research. */
export const makeProjectPipeline = (kit: ResearchKit): PipelineModel<ProjectState, ResearchDeps> => {
  const { wiring, limits, sources } = kit
  const stamp = (): string => new Date().toISOString()
  const clamp = (value: number | undefined, ceiling: number, floor: number): number =>
    Math.max(floor, Math.min(Math.floor(value ?? ceiling), ceiling))

  const taskText = (input: ProjectInput): string => [
    `# The product's site\n\n${input.url}`,
    ...(input.instruction != null && input.instruction.trim() !== '' ? [`## Instruction\n\n${textUtils.cap(input.instruction.trim(), limits.instructionChars)}`] : []),
  ].join('\n\n')

  const crawl: Step = {
    step: ProjectStep.Crawl,
    skipWhen: async (state, ctx) => state.crawlAt != null || await kit.area(ctx.runId).step(ProjectStep.Crawl) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const cloner = kit.cloner(area)
      let record: ProjectCrawl
      try {
        const result = await wiring.reader.crawl(state.input.url, {
          intent: PROJECT_CRAWL_INTENT, signal: ctx.signal,
          maxPages: clamp(state.input.maxPages, limits.maxProjectPages, 1), depth: clamp(state.input.depth, limits.maxProjectDepth, 0),
          ...(limits.crawlDelayMs != null ? { delay: limits.crawlDelayMs } : {}), ...(ctx.deps.key != null ? { key: ctx.deps.key } : {}),
        })
        for (const [index, page] of result.pages.entries()) {
          await cloner.page(`p${String(index + 1).padStart(2, '0')}`, page, { role: 'page' })
        }
        record = { pages: result.pages.length, skipped: result.skipped.length }
      } catch (error) {
        ctx.signal.throwIfAborted()
        log.warn('Project site not read', { url: urlUtils.loggable(state.input.url), error })
        record = { pages: 0, skipped: 0, error: (error as Error).message }
      }
      await area.saveStep(ProjectStep.Crawl, record)
      ctx.report(`${record.pages} pages read`)
      return { crawlAt: stamp(), pages: record.pages, skipped: record.skipped }
    },
  }

  const screen: Step = {
    step: ProjectStep.Screen,
    skipWhen: async (state, ctx) => state.screenAt != null || await kit.area(ctx.runId).step(ProjectStep.Screen) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const counts = await kit.screener(area, `functional summary of the product at ${state.input.url}`).screen(ctx.signal)
      await area.saveStep(ProjectStep.Screen, counts)
      return { screenAt: stamp(), ...counts }
    },
  }

  const summarize: Step = {
    step: ProjectStep.Summarize,
    skipWhen: async (state, ctx) => state.summarizeAt != null || await kit.area(ctx.runId).step(ProjectStep.Summarize) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const crawled = await area.step<ProjectCrawl>(ProjectStep.Crawl)
      const records = await area.units()
      const gaps: ResearchGap[] = [
        ...(crawled?.error != null ? [{ code: ResearchGapCode.SourceFailed, subject: state.input.url, detail: crawled.error }] : []),
        ...sources.gaps(records),
      ]
      const loaded = await sources.load(sources.usable(records))
      if (loaded.length === 0) {
        const output: ProjectOutput = { sources: [], pages: crawled?.pages ?? 0, gaps: sources.cap([...gaps, { code: ResearchGapCode.NoSources, subject: state.input.url }]) }
        await area.saveStep(ProjectStep.Summarize, { output })
        return { summarizeAt: stamp(), cited: 0, output }
      }

      const fitted = sources.fit(loaded)
      const answer = await wiring.models.text(ResearchRole.Analyst, {
        instruction: SUMMARIZE_INSTRUCTION, content: `${taskText(state.input)}\n\n# Pages\n\n${fitted.text}`,
      }, { action: 'research-summarize' })
      const body = answer.replace(/^#\s[^\n]*\n+/, '').replace(/\n#{1,2}\s+Sources\b[\s\S]*$/i, '').trim()
      const check = sources.check(body, fitted.refs.length)
      const site = loaded[0]!.record.title ?? new URL(state.input.url).hostname
      const doc = [`# Product: ${textUtils.line(site, 160)}`, `Read from ${state.input.url}.`, body, sources.list(fitted.refs)].join('\n\n') + '\n'
      await wiring.store.outputs.writeDoc(state.input.outputs.doc, doc)
      const output: ProjectOutput = {
        doc: state.input.outputs.doc, sources: fitted.refs, pages: crawled?.pages ?? loaded.length,
        gaps: sources.cap([...gaps, ...(check.cited.length === 0 ? [{ code: ResearchGapCode.Uncited }] : [])]),
      }
      await area.saveStep(ProjectStep.Summarize, { output })
      ctx.report(`summary written, ${check.cited.length} of ${fitted.refs.length} pages cited`)
      return { summarizeAt: stamp(), cited: check.cited.length, output }
    },
  }

  const cleanup: Step = {
    step: ProjectStep.Cleanup,
    skipWhen: async (state, ctx) => state.cleanupAt != null
      || (state.output != null && (await wiring.store.sources.list(kit.area(ctx.runId).prefix)).length === 0),
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const output = state.output ?? (await area.step<{ output: ProjectOutput }>(ProjectStep.Summarize))?.output
        ?? { sources: [], pages: 0, gaps: [] }
      await ctx.mark({ output })
      await area.clear()
      return { cleanupAt: stamp(), output }
    },
  }

  return makePipeline<ProjectState, ResearchDeps>(projectSpec, { ...kit.runner, steps: [crawl, screen, summarize, cleanup] })
}
