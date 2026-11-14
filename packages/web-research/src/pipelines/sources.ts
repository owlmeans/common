import { tokenBudgetHelper } from '@owlmeans/llm/tokens'
import { ResearchGapCode, ScreenVerdict, SourceStatus } from '../consts.js'
import type { ResearchGap } from '../types.js'
import { textUtils } from '../utils/text.js'
import type { SourceRecord } from './area/types.js'
import type { LoadedSource, SourcesHelper, SourcesHelperOptions } from './sources/types.js'

export const makeSourcesHelper = (options: SourcesHelperOptions): SourcesHelper => {
  const { sources, limits } = options

  const header = (index: number, record: SourceRecord): string =>
    `### [${index}] ${textUtils.line(record.title ?? record.url, 160)}\nURL: ${record.finalUrl ?? record.url}`

  const usable: SourcesHelper['usable'] = records => records.filter(record =>
    record.status === SourceStatus.Ok && record.content != null && record.screen?.verdict !== ScreenVerdict.Dropped)

  const load: SourcesHelper['load'] = async records => {
    const loaded: LoadedSource[] = []
    for (const record of records) {
      const text = record.content != null ? await sources.read(record.content) : null
      if (text == null || text.trim() === '') continue
      loaded.push({ record, text: textUtils.cap(text.trim(), limits.sourceChars) })
    }
    return loaded
  }

  const fit: SourcesHelper['fit'] = loaded => {
    const parts = loaded.map((source, index) => ({
      id: source.record.id, text: `${header(index + 1, source.record)}\n\n${source.text}`, priority: 1, minTokens: limits.minSourceTokens,
    }))
    const fitted = tokenBudgetHelper.fit(parts, limits.promptTokens, { separator: '\n\n---\n\n' })
    const kept = fitted.parts.filter(part => fitted.kept.includes(part.id) || fitted.trimmed.includes(part.id))
    const byId = new Map(loaded.map(source => [source.record.id, source.record]))
    // Numbers follow the sources a model actually reads, so a dropped one leaves no hole in the list.
    const blocks = kept.map((part, index) => {
      const record = byId.get(part.id)!
      return part.text.replace(/^### \[\d+\][^\n]*\nURL: [^\n]*/, header(index + 1, record))
    })
    return {
      text: blocks.join('\n\n---\n\n'),
      refs: kept.map(part => {
        const record = byId.get(part.id)!
        return { url: record.finalUrl ?? record.url, ...(record.title != null ? { title: record.title } : {}) }
      }),
      trimmed: fitted.trimmed.length,
      omitted: fitted.dropped.length,
    }
  }

  const list: SourcesHelper['list'] = refs => ['## Sources', '', ...refs.map((ref, index) =>
    `${index + 1}. [${(ref.title ?? ref.url).replace(/[[\]]/g, '')}](${ref.url})`)].join('\n')

  const check: SourcesHelper['check'] = (text, count) => {
    const numbers = [...text.matchAll(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g)]
      .flatMap(match => match[1]!.split(/\s*[,–-]\s*/).map(Number))
    const unique = [...new Set(numbers)]
    return { cited: unique.filter(n => n >= 1 && n <= count).sort((a, b) => a - b), invalid: unique.filter(n => n < 1 || n > count) }
  }

  const gaps: SourcesHelper['gaps'] = records => records.flatMap((record): ResearchGap[] => {
    const subject = record.finalUrl ?? record.url
    if (record.status === SourceStatus.Failed) {
      return [{ code: ResearchGapCode.SourceFailed, subject, ...(record.reason != null ? { detail: record.reason } : {}) }]
    }
    if (record.status === SourceStatus.Unreadable) {
      return [{ code: ResearchGapCode.SourceUnreadable, subject, ...(record.reason != null ? { detail: record.reason } : {}) }]
    }
    if (record.screen?.verdict === ScreenVerdict.Dropped) {
      return [{ code: ResearchGapCode.SourceScreened, subject, detail: [record.screen.kinds.join(', '), record.screen.reason].filter(Boolean).join(' — ') }]
    }
    if (record.screen?.verdict === ScreenVerdict.Flagged) {
      return [{ code: ResearchGapCode.SourceFlagged, subject, detail: record.screen.kinds.join(', ') }]
    }
    return []
  })

  const cap: SourcesHelper['cap'] = entries => {
    const seen = new Set<string>()
    return entries.filter(gap => {
      const key = `${gap.code}:${gap.subject ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, limits.maxGaps).map(gap => gap.detail != null ? { ...gap, detail: textUtils.line(gap.detail, 300) } : gap)
  }

  return { usable, load, fit, list, check, gaps, cap }
}
