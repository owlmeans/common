import en from './i18n/en.json' with { type: 'json' }
import { UploadEntryStatus } from './consts.js'
import { SIZE_UNITS } from './text/consts.local.js'
import type { UploadText } from './text/types.js'
import type { UploadTranslate } from './types.js'

/** The packaged English string of a key — the fallback every lookup carries. */
const englishOf = (key: string): string => {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  return typeof value === 'string' ? value : key
}

const english: UploadTranslate = (_key, fallback) => fallback

/**
 * The strings of the parts in one language: `translate` (English without it — `useUploadI18n()`
 * gives one over the packaged eight-language bundle) and `locale` for numbers and sizes. Pure: build
 * it once per render, or outside React for an application's own UI.
 */
export const makeUploadText = (translate: UploadTranslate = english, locale = 'en'): UploadText => {
  const number = (value: number, fraction = 0): string => {
    try {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: fraction }).format(value)
    } catch {
      return value.toFixed(fraction)
    }
  }

  // Filled after translation: a `{name}` placeholder is never one i18next interpolates or strips.
  const text: UploadText['text'] = (key, values = {}) => Object.entries(values).reduce(
    (result, [name, value]) => result.split(`{${name}}`).join(String(value)), translate(key, englishOf(key)),
  )

  const size: UploadText['size'] = bytes => {
    let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0)
    if (value < 1024) {
      return `${number(value)} ${text('units.byte')}`
    }
    let unit = -1
    while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
      value /= 1024
      unit += 1
    }
    const fraction = value >= 10 ? 0 : 1
    try {
      return new Intl.NumberFormat(locale, { style: 'unit', unit: SIZE_UNITS[unit], unitDisplay: 'short', maximumFractionDigits: fraction })
        .format(value)
    } catch {
      return `${number(value, fraction)} ${['kB', 'MB', 'GB'][unit]}`
    }
  }

  const count: UploadText['count'] = value => number(value)

  const percent: UploadText['percent'] = ratio => {
    const share = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0))
    try {
      return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(share)
    } catch {
      return `${Math.round(share * 100)}%`
    }
  }

  const status: UploadText['status'] = entry => entry.status === UploadEntryStatus.Uploading
    ? text('status.uploading', { percent: percent(entry.progress) })
    : text(`status.${entry.status}`)

  const detail: UploadText['detail'] = (entry, limits) => {
    const parts: string[] = []
    if (entry.status === UploadEntryStatus.Rejected) {
      if (entry.limit != null && limits != null) {
        parts.push(text(`limit.${entry.limit}`, {
          max: entry.limit === 'files' ? count(limits.maxFiles)
            : size(entry.limit === 'file-bytes' ? limits.maxFileBytes : limits.maxTotalBytes),
        }))
      } else if (entry.reason != null) {
        parts.push(text(`reason.${entry.reason}`))
      }
    } else if (entry.status === UploadEntryStatus.Failed) {
      parts.push(text('failed'))
    }
    if (entry.from != null) {
      parts.push(text('from', { archive: entry.from }))
    }

    return parts.length > 0 ? parts.join(' · ') : null
  }

  const violation: UploadText['violation'] = known => known.code === 'max-files'
    ? text('violation.max-files', { count: count(known.actual), max: count(known.limit) })
    : known.code === 'max-total-bytes'
      ? text('violation.max-total-bytes', { size: size(known.actual), max: size(known.limit) })
      : text('violation.max-file-bytes', { max: size(known.limit), count: count(known.entries.length) })

  const hints: UploadText['hints'] = limits =>
    text('hints', { files: count(limits.maxFiles), file: size(limits.maxFileBytes), total: size(limits.maxTotalBytes) })

  const totals: UploadText['totals'] = known => text('totals', { count: count(known.files), size: size(known.bytes) })

  const progress: UploadText['progress'] = known => text('progress', { loaded: size(known.loaded), total: size(known.total) })

  return { text, size, count, percent, status, detail, violation, hints, totals, progress }
}
