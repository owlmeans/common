import { makePipeline } from '@owlmeans/agent'
import type { PipelineModel } from '@owlmeans/agent'
import { logger } from '@owlmeans/log'
import { PackageVerdictKind } from '@owlmeans/package-inspector'
import type { PackageVerdict } from '@owlmeans/package-inspector'
import { DOCS_CRAWL_INTENT, PackagesStep, ResearchGapCode, ResearchRole } from '../consts.js'
import type { ResearchDeps, ResearchGap } from '../types.js'
import { textUtils } from '../utils/text.js'
import { packageEntryUtils } from '../utils/entry.js'
import { NOTES_INSTRUCTION, VERDICTS_FILE, packagesSpec } from './packages/consts.js'
import type { PackagesStepImpl as Step } from './packages/types.local.js'
import type {
  PackageNotes, PackageNotesRef, PackageRead, PackagesInput, PackagesInspected, PackagesOutput, PackagesState, PackageVerdictSummary,
} from './packages/types.js'
import type { ResearchKit } from './types.local.js'

const log = logger('web-research:packages')

/** `research:packages`. The read and notes loops are guarded per package by its own record. */
export const makePackagesPipeline = (kit: ResearchKit): PipelineModel<PackagesState, ResearchDeps> => {
  const { wiring, limits, sources } = kit
  const stamp = (): string => new Date().toISOString()
  const clamp = (value: number | undefined, ceiling: number): number => Math.max(1, Math.min(Math.floor(value ?? ceiling), ceiling))

  const requested = (input: PackagesInput) => input.packages.slice(0, limits.maxPackages)
  const keyOf = (index: number): string => `k${String(index + 1).padStart(2, '0')}`
  const genuineOf = (verdicts: readonly PackageVerdict[]): PackageVerdict[] =>
    verdicts.filter(verdict => verdict.verdict === PackageVerdictKind.Genuine)

  const summary = (verdict: PackageVerdict): PackageVerdictSummary => ({
    name: verdict.name, verdict: verdict.verdict, reasons: verdict.reasons, downloads: verdict.downloads,
    ...(verdict.lookalikeOf != null ? { lookalikeOf: verdict.lookalikeOf } : {}),
    ...(verdict.findings[0] != null ? { detail: verdict.findings[0].detail } : {}),
    ...(verdict.facts?.latest != null ? { latest: verdict.facts.latest } : {}),
  })

  const factsText = (verdict: PackageVerdict): string => {
    const facts = verdict.facts
    const entry = packageEntryUtils.section(verdict.name, facts?.entry, facts?.readme)
    return [
      `# Package: ${verdict.name}`,
      ...(facts?.latest != null ? [`Current version: ${facts.latest} (major ${facts.latest.split('.')[0]})`] : []),
      ...(facts?.description != null ? [`Description: ${textUtils.line(facts.description, 300)}`] : []),
      ...(facts?.license != null ? [`License: ${facts.license}`] : []),
      ...(verdict.docs.homepage != null ? [`Homepage: ${verdict.docs.homepage}`] : []),
      ...(verdict.docs.repository != null ? [`Repository: ${verdict.docs.repository}`] : []),
      ...(facts?.deprecated != null ? [`DEPRECATED: ${textUtils.line(facts.deprecated, 300)}`] : []),
      ...(verdict.downloads != null ? [`Weekly downloads: ${verdict.downloads}`] : []),
      ...(verdict.intent != null ? [`Wanted for: ${textUtils.line(verdict.intent, 200)}`] : []),
      // How the package is imported, as its manifest and its readme say — what the Imports section derives from.
      ...(entry !== '' ? ['', entry] : []),
    ].join('\n')
  }

  /** Headings one level deeper, outside code fences — a package's notes nested under its own heading. */
  const demote = (markdown: string): string => {
    let fenced = false
    return markdown.split('\n').map(line => {
      if (/^\s*```/.test(line)) fenced = !fenced
      return !fenced && /^#{1,5}\s/.test(line) ? `#${line}` : line
    }).join('\n')
  }

  const verdictsOf = async (runId: string): Promise<PackageVerdict[]> => await kit.area(runId).read<PackageVerdict[]>(VERDICTS_FILE) ?? []

  const inspect: Step = {
    step: PackagesStep.Inspect,
    skipWhen: async (state, ctx) => state.inspectAt != null || await kit.area(ctx.runId).step(PackagesStep.Inspect) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      if (wiring.inspector == null) {
        await area.saveStep(PackagesStep.Inspect, { unavailable: true, count: 0, genuine: 0 } satisfies PackagesInspected)
        return { inspectAt: stamp(), inspected: 0, genuine: 0 }
      }
      const verdicts = await wiring.inspector.inspectAll(requested(state.input).map(request => ({
        name: request.name.trim(), ...(request.intent != null ? { intent: request.intent } : {}),
      })))
      await area.write(VERDICTS_FILE, verdicts)
      const genuine = genuineOf(verdicts).length
      await area.saveStep(PackagesStep.Inspect, { count: verdicts.length, genuine } satisfies PackagesInspected)
      ctx.report(`${genuine} of ${verdicts.length} packages genuine`)
      return { inspectAt: stamp(), inspected: verdicts.length, genuine }
    },
  }

  const read: Step = {
    step: PackagesStep.Read,
    skipWhen: async (state, ctx) => state.readAt != null || await kit.area(ctx.runId).step(PackagesStep.Read) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const cloner = kit.cloner(area)
      const verdicts = await verdictsOf(ctx.runId)
      let count = 0
      for (const [index, verdict] of verdicts.entries()) {
        if (verdict.verdict !== PackageVerdictKind.Genuine) continue
        const key = keyOf(index)
        const unit = `packages/${key}.read.json`
        let done = await area.read<PackageRead>(unit)
        if (done == null) {
          const readme = verdict.facts?.readme?.trim()
          if (readme != null && readme !== '') {
            await cloner.text(`${key}-0`, verdict.docs.page ?? verdict.docs.repository ?? verdict.docs.homepage ?? `package:${verdict.name}`,
              textUtils.cap(readme, limits.readmeChars), { group: verdict.name, role: 'readme', title: `${verdict.name} readme` })
          }
          const start = verdict.docs.homepage ?? (verdict.docs.repository?.startsWith('http') === true ? verdict.docs.repository : undefined)
          let pages = 0
          let docsError: string | undefined = start == null ? 'no homepage or repository page' : undefined
          if (start != null) {
            try {
              const result = await wiring.reader.crawl(start, {
                intent: DOCS_CRAWL_INTENT, maxPages: clamp(state.input.maxPages, limits.maxDocsPages), depth: limits.docsDepth,
                signal: ctx.signal, ...(limits.crawlDelayMs != null ? { delay: limits.crawlDelayMs } : {}),
                ...(ctx.deps.key != null ? { key: ctx.deps.key } : {}),
              })
              for (const [at, page] of result.pages.entries()) {
                await cloner.page(`${key}-d${String(at + 1).padStart(2, '0')}`, page, { group: verdict.name, role: 'docs' })
              }
              pages = result.pages.length
              if (pages === 0) docsError = result.skipped[0]?.reason ?? 'no page read'
            } catch (error) {
              ctx.signal.throwIfAborted()
              log.warn('Package documentation not read', { name: verdict.name, error })
              docsError = (error as Error).message
            }
          }
          done = { name: verdict.name, readme: readme != null && readme !== '', pages, ...(docsError != null ? { docsError } : {}) }
          await area.write(unit, done)
        }
        count += (done.readme ? 1 : 0) + done.pages
      }
      await area.saveStep(PackagesStep.Read, { sources: count })
      return { readAt: stamp(), read: count }
    },
  }

  const screen: Step = {
    step: PackagesStep.Screen,
    skipWhen: async (state, ctx) => state.screenAt != null || await kit.area(ctx.runId).step(PackagesStep.Screen) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const names = requested(state.input).map(request => request.name).join(', ')
      const counts = await kit.screener(area, `usage notes for the packages ${textUtils.line(names, 200)}`).screen(ctx.signal)
      await area.saveStep(PackagesStep.Screen, counts)
      return { screenAt: stamp(), ...counts }
    },
  }

  const notes: Step = {
    step: PackagesStep.Notes,
    skipWhen: async (state, ctx) => state.notesAt != null || await kit.area(ctx.runId).step(PackagesStep.Notes) != null,
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const inspected = await area.step<PackagesInspected>(PackagesStep.Inspect)
      const verdicts = await verdictsOf(ctx.runId)
      const records = await area.units()
      const gaps: ResearchGap[] = inspected?.unavailable === true ? [{ code: ResearchGapCode.InspectorUnavailable }] : []
      const sections: string[] = []
      const refs: PackageNotesRef[] = []
      let written = 0

      for (const [index, verdict] of verdicts.entries()) {
        if (verdict.verdict !== PackageVerdictKind.Genuine) {
          gaps.push({ code: ResearchGapCode.NotGenuine, subject: verdict.name, detail: `${verdict.verdict}${verdict.findings[0] != null ? `: ${verdict.findings[0].detail}` : ''}` })
          continue
        }
        const key = keyOf(index)
        const readRecord = await area.read<PackageRead>(`packages/${key}.read.json`)
        if (readRecord?.readme === false) gaps.push({ code: ResearchGapCode.ReadmeMissing, subject: verdict.name })
        if (readRecord?.docsError != null) gaps.push({ code: ResearchGapCode.DocsUnavailable, subject: verdict.name, detail: readRecord.docsError })
        const group = records.filter(record => record.group === verdict.name)
        gaps.push(...sources.gaps(group))

        const unit = `packages/${key}.notes.json`
        let done = await area.read<PackageNotes>(unit)
        if (done == null) {
          const loaded = await sources.load(sources.usable(group))
          if (loaded.length === 0) {
            done = { name: verdict.name, cited: 0, sources: 0 }
          } else {
            const fitted = sources.fit(loaded)
            const context = state.input.context != null && state.input.context.trim() !== ''
              ? `\n\n## Product context\n\n${textUtils.cap(state.input.context.trim(), limits.contextChars)}` : ''
            const answer = await wiring.models.text(ResearchRole.Writer, {
              instruction: NOTES_INSTRUCTION, content: `${factsText(verdict)}${context}\n\n# Sources\n\n${fitted.text}`,
            }, { action: 'research-package-notes' })
            const body = answer.replace(/^#\s[^\n]*\n+/, '').replace(/\n#{1,2}\s+Sources\b[\s\S]*$/i, '').trim()
            const check = sources.check(body, fitted.refs.length)
            // The entry points are the package's facts, written by the package — the skill writer reads them here.
            const entry = packageEntryUtils.section(verdict.name, verdict.facts?.entry, verdict.facts?.readme)
            const text = [
              `# ${verdict.name} — usage notes`,
              `Version ${verdict.facts?.latest ?? 'unknown'} · ${verdict.facts?.license ?? 'license unknown'}${verdict.docs.homepage != null ? ` · ${verdict.docs.homepage}` : ''}`,
              ...(entry !== '' ? [entry] : []),
              body,
              sources.list(fitted.refs),
            ].join('\n\n') + '\n'
            const path = area.path('packages', `${key}.notes.md`)
            await wiring.store.sources.put(path, text)
            done = { name: verdict.name, notes: path, cited: check.cited.length, sources: fitted.refs.length }
          }
          await area.write(unit, done)
        }
        if (done.notes == null) {
          gaps.push({ code: ResearchGapCode.NoSources, subject: verdict.name })
          continue
        }
        if (done.cited === 0) gaps.push({ code: ResearchGapCode.Uncited, subject: verdict.name })
        const text = await wiring.store.sources.read(done.notes) ?? ''
        sections.push(demote(text.trim()))
        const own = state.input.outputs.notesDir != null ? `${state.input.outputs.notesDir.replace(/\/+$/, '')}/${textUtils.segment(verdict.name.replace(/^@/, '').replace('/', '__'))}.md` : undefined
        if (own != null) await wiring.store.outputs.writeDoc(own, text)
        refs.push({ name: verdict.name, doc: own ?? state.input.outputs.doc })
        written++
      }

      const table = [
        '| Package | Verdict | Version | Weekly downloads | Why |',
        '|---|---|---|---|---|',
        ...verdicts.map(verdict => `| ${verdict.name} | ${verdict.verdict} | ${verdict.facts?.latest ?? ''} | ${verdict.downloads ?? ''} | ${(verdict.findings[0]?.detail ?? '').replace(/\|/g, '\\|')}${verdict.lookalikeOf != null && verdict.verdict !== PackageVerdictKind.Genuine ? ` — did you mean ${verdict.lookalikeOf}?` : ''} |`),
      ].join('\n')
      const refused = verdicts.filter(verdict => verdict.verdict !== PackageVerdictKind.Genuine)
      const doc = [
        '# Package research',
        verdicts.length > 0 ? table : 'No package was inspected.',
        ...(refused.length > 0 ? [`Not to be installed: ${refused.map(verdict => verdict.name).join(', ')} — only genuine packages get notes.`] : []),
        ...sections,
      ].join('\n\n') + '\n'
      const output: PackagesOutput = {
        verdicts: verdicts.map(summary), notes: refs, gaps: sources.cap(gaps),
        ...(verdicts.length > 0 ? { doc: state.input.outputs.doc } : {}),
      }
      if (verdicts.length > 0) await wiring.store.outputs.writeDoc(state.input.outputs.doc, doc)
      await area.saveStep(PackagesStep.Notes, { output })
      ctx.report(`notes for ${written} packages`)
      return { notesAt: stamp(), written, output }
    },
  }

  const cleanup: Step = {
    step: PackagesStep.Cleanup,
    skipWhen: async (state, ctx) => state.cleanupAt != null
      || (state.output != null && (await wiring.store.sources.list(kit.area(ctx.runId).prefix)).length === 0),
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const output = state.output ?? (await area.step<{ output: PackagesOutput }>(PackagesStep.Notes))?.output
        ?? { verdicts: [], notes: [], gaps: [] }
      await ctx.mark({ output })
      await area.clear()
      return { cleanupAt: stamp(), output }
    },
  }

  return makePipeline<PackagesState, ResearchDeps>(packagesSpec, { ...kit.runner, steps: [inspect, read, screen, notes, cleanup] })
}
