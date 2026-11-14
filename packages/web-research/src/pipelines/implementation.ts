import { makePipeline } from '@owlmeans/agent'
import { LlmSearchUnsupportedError } from '@owlmeans/llm'
import type { PipelineModel } from '@owlmeans/agent'
import { ImplementationStep, ResearchGapCode, ResearchRole, SourceStatus } from '../consts.js'
import type { ResearchDeps, ResearchGap, ResearchSourceRef } from '../types.js'
import { textUtils } from '../utils/text.js'
import { urlUtils } from '../utils/url.js'
import { PLAN_INSTRUCTION, SEARCH_INSTRUCTIONS, SYNTHESIZE_INSTRUCTION, implementationSpec } from './implementation/consts.js'
import { PlanAnswerSchema } from './implementation/schemas.js'
import type {
  ImplementationCandidates, ImplementationInput, ImplementationOutput, ImplementationPlan, ImplementationSearch, ImplementationState,
} from './implementation/types.js'
import type { ImplementationStepImpl as Step } from './implementation/types.local.js'
import type { ResearchKit } from './types.local.js'

/**
 * `research:implementation`. Every step reads what the one before it recorded in the run's area, so
 * a run resumed in a fresh process reads it back; each step is skipped on its state marker or on its
 * durable record, and the search and collect loops skip every unit already recorded.
 */
export const makeImplementationPipeline = (kit: ResearchKit): PipelineModel<ImplementationState, ResearchDeps> => {
  const { wiring, limits, sources } = kit
  const stamp = (): string => new Date().toISOString()
  const clamp = (value: number | undefined, ceiling: number): number => Math.max(1, Math.min(Math.floor(value ?? ceiling), ceiling))
  /**
   * A search port that cannot search at all — by class, or by its registered type when the error crossed
   * a package copy. A per-query failure is something else: recorded as `search-failed` for that query.
   */
  const unsupported = (error: unknown): boolean => error instanceof LlmSearchUnsupportedError
    || (error as { type?: unknown } | null)?.type === LlmSearchUnsupportedError.typeName

  const taskText = (input: ImplementationInput): string => [
    `# Task\n\n${textUtils.line(input.topic, 500)}`,
    ...(input.questions != null && input.questions.length > 0
      ? [`## Questions\n\n${input.questions.slice(0, 12).map(question => `- ${textUtils.line(question, 300)}`).join('\n')}`] : []),
    ...(input.instruction != null && input.instruction.trim() !== '' ? [`## Instruction\n\n${textUtils.cap(input.instruction.trim(), limits.instructionChars)}`] : []),
    ...(input.context != null && input.context.trim() !== '' ? [`## Product context\n\n${textUtils.cap(input.context.trim(), limits.contextChars)}`] : []),
  ].join('\n\n')

  const plan: Step = {
    step: ImplementationStep.Plan,
    skipWhen: async (state, ctx) => state.planAt != null || await kit.area(ctx.runId).step(ImplementationStep.Plan) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      if (wiring.search == null) {
        await area.saveStep(ImplementationStep.Plan, { queries: [], unavailable: true } satisfies ImplementationPlan)
        return { planAt: stamp(), queries: 0 }
      }
      const max = clamp(state.input.maxQueries, limits.maxQueries)
      const answer = await wiring.models.json(ResearchRole.Analyst, {
        instruction: PLAN_INSTRUCTION.replace('{max}', String(max)), content: taskText(state.input),
      }, PlanAnswerSchema, { action: 'research-plan' })
      const seen = new Set<string>()
      const queries = answer.queries.map(query => textUtils.line(query, 200)).filter(query => {
        const key = query.toLowerCase()
        if (query === '' || seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, max)
      const planned = queries.length > 0 ? queries : [textUtils.line(state.input.topic, 200)]
      await area.saveStep(ImplementationStep.Plan, { queries: planned } satisfies ImplementationPlan)
      ctx.report(`${planned.length} searches planned`)
      return { planAt: stamp(), queries: planned.length }
    },
  }

  const search: Step = {
    step: ImplementationStep.Search,
    skipWhen: async (state, ctx) => state.searchAt != null || await kit.area(ctx.runId).step(ImplementationStep.Search) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const planned = await area.step<ImplementationPlan>(ImplementationStep.Plan)
      const blocked = (state.input.blockedDomains ?? []).map(domain => domain.trim().toLowerCase()).filter(domain => domain !== '')
      /** One search, read into the pages it names — or the reason it named none. */
      const ask = async (query: string): Promise<ImplementationSearch> => {
        // Resumed over a wiring without search: the query is recorded as failed, nothing is asked.
        if (wiring.search == null) return { query, urls: [], searches: 0, error: 'search-unavailable' }
        try {
          const result = await wiring.search.search(query, {
            maxUses: 1, contextSize: 'low', instructions: SEARCH_INSTRUCTIONS, action: 'research-search', signal: ctx.signal,
            ...(blocked.length > 0 ? { blockedDomains: blocked } : {}), ...(wiring.spectator != null ? { spectator: wiring.spectator } : {}),
          })
          const titles = new Map(result.sources.map(source => [source.url, source.title]))
          const urls = [...result.citations.map(citation => ({ url: citation.url, title: citation.title ?? titles.get(citation.url) })), ...result.sources]
            .map(ref => ({ url: ref.url, ...(ref.title != null && ref.title !== '' ? { title: ref.title } : {}) }))
          return { query, urls, searches: result.searches }
        } catch (error) {
          ctx.signal.throwIfAborted()
          if (unsupported(error)) return { query, urls: [], searches: 0, error: 'search-unavailable', unavailable: true }
          return { query, urls: [], searches: 0, error: (error as Error).message }
        }
      }

      const answers: ImplementationSearch[] = []
      for (const [index, query] of (planned?.queries ?? []).entries()) {
        const unit = `search/${index + 1}.json`
        let answer = await area.read<ImplementationSearch>(unit)
        if (answer == null) {
          // Once a search answered that searching is unavailable, the next queries are not asked.
          answer = answers.some(earlier => earlier.unavailable === true)
            ? { query, urls: [], searches: 0, error: 'search-unavailable', unavailable: true }
            : await ask(query)
          await area.write(unit, answer)
        }
        answers.push(answer)
      }

      // Each query's best page first, then each query's second — so no single search fills every slot.
      const take = clamp(state.input.maxResults, limits.maxResults) + limits.collectSpare
      const seen = new Set<string>()
      const candidates: ResearchSourceRef[] = []
      const depth = Math.max(0, ...answers.map(answer => answer.urls.length))
      for (let rank = 0; rank < depth && candidates.length < take; rank++) {
        for (const answer of answers) {
          const ref = answer.urls[rank]
          const url = ref != null ? urlUtils.normalize(ref.url) : null
          if (ref == null || url == null || seen.has(url) || urlUtils.blocked(url, blocked)) continue
          seen.add(url)
          candidates.push({ url, ...(ref.title != null ? { title: ref.title } : {}) })
          if (candidates.length >= take) break
        }
      }
      const unavailable = answers.some(answer => answer.unavailable === true)
      const record: ImplementationCandidates = {
        candidates, failed: answers.filter(answer => answer.error != null && answer.unavailable !== true).map(answer => answer.query),
        ...(unavailable ? { unavailable } : {}),
      }
      await area.saveStep(ImplementationStep.Search, record)
      ctx.report(`${candidates.length} pages to open`)
      return { searchAt: stamp(), searches: answers.reduce((sum, answer) => sum + answer.searches, 0), candidates: candidates.length }
    },
  }

  const collect: Step = {
    step: ImplementationStep.Collect,
    skipWhen: async (state, ctx) => state.collectAt != null || await kit.area(ctx.runId).step(ImplementationStep.Collect) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const cloner = kit.cloner(area)
      const found = await area.step<ImplementationCandidates>(ImplementationStep.Search)
      const target = clamp(state.input.maxResults, limits.maxResults)
      let collected = 0
      for (const [index, candidate] of (found?.candidates ?? []).entries()) {
        if (collected >= target) break
        const id = `s${String(index + 1).padStart(2, '0')}`
        const record = await area.unit(id) ?? await cloner.collect(id, candidate.url, {
          limits: limits.implementationCollect, signal: ctx.signal,
          ...(candidate.title != null ? { title: candidate.title } : {}), ...(ctx.deps.key != null ? { key: ctx.deps.key } : {}),
        })
        if (record.status === SourceStatus.Ok) collected++
      }
      await area.saveStep(ImplementationStep.Collect, { collected })
      ctx.report(`${collected} pages cloned`)
      return { collectAt: stamp(), collected }
    },
  }

  const screen: Step = {
    step: ImplementationStep.Screen,
    skipWhen: async (state, ctx) => state.screenAt != null || await kit.area(ctx.runId).step(ImplementationStep.Screen) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const counts = await kit.screener(area, `implementation research: ${textUtils.line(state.input.topic, 200)}`).screen(ctx.signal)
      await area.saveStep(ImplementationStep.Screen, counts)
      return { screenAt: stamp(), ...counts }
    },
  }

  const synthesize: Step = {
    step: ImplementationStep.Synthesize,
    skipWhen: async (state, ctx) => state.synthesizeAt != null || await kit.area(ctx.runId).step(ImplementationStep.Synthesize) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const planned = await area.step<ImplementationPlan>(ImplementationStep.Plan)
      const found = await area.step<ImplementationCandidates>(ImplementationStep.Search)
      const records = await area.units()
      // No search port, or a port that answered it cannot search: the same `search-unavailable`.
      const unavailable = planned?.unavailable === true || found?.unavailable === true
      const gaps: ResearchGap[] = [
        ...(unavailable ? [{ code: ResearchGapCode.SearchUnavailable }] : []),
        ...(found?.failed ?? []).map(query => ({ code: ResearchGapCode.SearchFailed, subject: query })),
        ...(!unavailable && (found?.candidates.length ?? 0) === 0 ? [{ code: ResearchGapCode.NoCandidates }] : []),
        ...sources.gaps(records),
      ]
      const loaded = await sources.load(sources.usable(records))
      if (loaded.length === 0) {
        const output: ImplementationOutput = {
          sources: [], gaps: sources.cap([...gaps, ...(unavailable ? [] : [{ code: ResearchGapCode.NoSources }])]),
        }
        await area.saveStep(ImplementationStep.Synthesize, { output })
        return { synthesizeAt: stamp(), cited: 0, output }
      }

      const fitted = sources.fit(loaded)
      const answer = await wiring.models.text(ResearchRole.Analyst, {
        instruction: SYNTHESIZE_INSTRUCTION, content: `${taskText(state.input)}\n\n# Sources\n\n${fitted.text}`,
      }, { action: 'research-synthesize' })
      const body = answer.replace(/^#\s[^\n]*\n+/, '').replace(/\n#{1,2}\s+Sources\b[\s\S]*$/i, '').trim()
      const check = sources.check(body, fitted.refs.length)
      const doc = [`# Research: ${textUtils.line(state.input.topic, 200)}`, body, sources.list(fitted.refs)].join('\n\n') + '\n'
      await wiring.store.outputs.writeDoc(state.input.outputs.doc, doc)
      const output: ImplementationOutput = {
        doc: state.input.outputs.doc, sources: fitted.refs,
        gaps: sources.cap([...gaps, ...(check.cited.length === 0 ? [{ code: ResearchGapCode.Uncited }] : [])]),
      }
      await area.saveStep(ImplementationStep.Synthesize, { output })
      ctx.report(`report written, ${check.cited.length} of ${fitted.refs.length} sources cited`)
      return { synthesizeAt: stamp(), cited: check.cited.length, output }
    },
  }

  const cleanup: Step = {
    step: ImplementationStep.Cleanup,
    skipWhen: async (state, ctx) => state.cleanupAt != null
      || (state.output != null && (await wiring.store.sources.list(kit.area(ctx.runId).prefix)).length === 0),
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const output = state.output ?? (await area.step<{ output: ImplementationOutput }>(ImplementationStep.Synthesize))?.output
        ?? { sources: [], gaps: [] }
      // The output is in the row before its record goes: a crash after the removal resumes from the row.
      await ctx.mark({ output })
      await area.clear()
      return { cleanupAt: stamp(), output }
    },
  }

  return makePipeline<ImplementationState, ResearchDeps>(implementationSpec, {
    ...kit.runner, steps: [plan, search, collect, screen, synthesize, cleanup],
  })
}
