import { refusalHelper } from '../../../refusal.js'
import { HAS_SCHEME, ISO_DAY, SANDBOX_ROOT, STACK_LINE } from './consts.js'
import type { PresentReadHelper, PresentedWorkload } from './types.js'

export const createPresentReadHelper = (): PresentReadHelper => {
  const recordOrNull: PresentReadHelper['recordOrNull'] = value =>
    value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

  const record: PresentReadHelper['record'] = value => recordOrNull(value) ?? {}

  const records: PresentReadHelper['records'] = value => Array.isArray(value)
    ? value.map(recordOrNull).filter((item): item is Record<string, unknown> => item != null)
    : []

  const text: PresentReadHelper['text'] = (value, fallback = '') => typeof value === 'string' ? value : fallback

  const maybeText: PresentReadHelper['maybeText'] = value =>
    typeof value === 'string' && value !== '' ? value : undefined

  const textOrNull: PresentReadHelper['textOrNull'] = value => maybeText(value) ?? null

  const texts: PresentReadHelper['texts'] = value => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

  const textsOrNulls: PresentReadHelper['textsOrNulls'] = value => Array.isArray(value)
    ? value.filter((item): item is string | null => item === null || typeof item === 'string')
    : []

  const maybeCount: PresentReadHelper['maybeCount'] = value =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  const count: PresentReadHelper['count'] = (value, fallback = 0) => maybeCount(value) ?? fallback

  const countOrNull: PresentReadHelper['countOrNull'] = value => maybeCount(value) ?? null

  const maybeFlag: PresentReadHelper['maybeFlag'] = value => typeof value === 'boolean' ? value : undefined

  const flag: PresentReadHelper['flag'] = (value, fallback = false) => maybeFlag(value) ?? fallback

  const day: PresentReadHelper['day'] = value => typeof value === 'string'
    ? ISO_DAY.exec(value)?.[0]
    : undefined

  const clean: PresentReadHelper['clean'] = value => {
    if (typeof value !== 'string') return undefined
    const said = value.split('\n').filter(line => !STACK_LINE.test(line)).join('\n').replace(SANDBOX_ROOT, '').trim()

    return said !== '' ? said : undefined
  }

  const warning: PresentReadHelper['warning'] = value =>
    typeof value === 'string' && value.trim() !== '' ? clean(refusalHelper.refusalPhrase(value)) : undefined

  const url: PresentReadHelper['url'] = host => {
    const address = maybeText(host)?.trim()
    if (address == null || address === '') return undefined

    return HAS_SCHEME.test(address) ? address : `https://${address}`
  }

  const project: PresentReadHelper['project'] = (structured, args) =>
    maybeText(structured.projectId) ?? maybeText(args.projectId) ?? ''

  const compact: PresentReadHelper['compact'] = value =>
    Object.fromEntries(Object.entries(value).filter(([, member]) => member !== undefined))

  const workload: PresentReadHelper['workload'] = value => {
    const slot = recordOrNull(value)
    if (slot == null) return null
    const warnings = [slot.lastError, slot.buildWarning, slot.backendWarning]
      .map(warning).filter((item): item is string => item != null)

    return compact({
      status: text(slot.status, 'unknown'),
      url: url(slot.host),
      initialized: maybeFlag(slot.initialized),
      warnings,
    }) as PresentedWorkload
  }

  const total: PresentReadHelper['total'] = present => (structured, args) => {
    try {
      return present(record(structured), record(args))
    } catch {
      return present({}, {})
    }
  }

  return {
    record, recordOrNull, records, text, maybeText, textOrNull, texts, textsOrNulls, count, maybeCount, countOrNull,
    flag, maybeFlag, day, warning, clean, url, project, workload, compact, total,
  }
}

export const presentReadHelper = createPresentReadHelper()
