import { logger } from '@owlmeans/log'
import { ScreenVerdict, SourceStatus } from '../consts.js'
import { injectionSignalsHelper } from '../screen.js'
import type { InjectionSignal, ScreenJudgement } from '../screen/types.js'
import type { SourceRecord, SourceScreen } from './area/types.js'
import type { ScreenCounts, SourceScreener, SourceScreenerOptions } from './screening/types.js'

const log = logger('web-research:screen')

export const makeSourceScreener = (options: SourceScreenerOptions): SourceScreener => {
  const { area, sources } = options
  const helper = injectionSignalsHelper

  const decide = async (record: SourceRecord, text: string, signals: InjectionSignal[]): Promise<SourceScreen> => {
    const kinds = [...new Set(signals.map(signal => signal.kind))]
    if (signals.length === 0) return { verdict: ScreenVerdict.Clean, kinds }
    if (options.judge != null) {
      let judgement: ScreenJudgement | null = null
      try {
        judgement = await options.judge.judge(helper.readable(text, record.rawKind), signals, {
          url: record.finalUrl ?? record.url, purpose: options.purpose, ...(record.title != null ? { title: record.title } : {}),
        })
      } catch (error) {
        // A judgement that could not be made decides nothing: the deterministic rule applies.
        log.warn('Injection judgement failed; the signal rule decides', { id: record.id, error })
      }
      if (judgement != null) {
        // A judge that finds no order clears the source: hidden menus and comments are the web's normal.
        return {
          verdict: judgement.injected ? ScreenVerdict.Dropped : ScreenVerdict.Clean, kinds, judged: true,
          ...(judgement.reason != null ? { reason: judgement.reason } : {}),
        }
      }
    }
    return helper.strong(signals, options.strong)
      ? { verdict: ScreenVerdict.Dropped, kinds, reason: 'strong hidden-instruction signals' }
      : { verdict: ScreenVerdict.Flagged, kinds, reason: 'weak hidden-instruction signals' }
  }

  const screen: SourceScreener['screen'] = async signal => {
    const counts: ScreenCounts = { kept: 0, dropped: 0, flagged: 0, judged: 0 }
    for (const record of await area.units()) {
      if (record.status !== SourceStatus.Ok) continue
      signal?.throwIfAborted()
      let verdict = record.screen
      if (verdict == null) {
        const path = record.raw ?? record.content
        const text = path != null ? await sources.read(path) ?? '' : ''
        const signals = helper.signals(text, record.rawKind != null ? { kind: record.rawKind } : {})
        verdict = await decide(record, text, signals)
        if (verdict.verdict === ScreenVerdict.Dropped) {
          log.warn('Source dropped: instructions to the agents', { id: record.id, kinds: verdict.kinds })
          await area.dropFiles(record.id)
        }
        await area.saveUnit({ ...record, screen: verdict })
      }
      if (verdict.judged === true) counts.judged++
      if (verdict.verdict === ScreenVerdict.Dropped) counts.dropped++
      else {
        counts.kept++
        if (verdict.verdict === ScreenVerdict.Flagged) counts.flagged++
      }
    }
    return counts
  }

  return { screen }
}
