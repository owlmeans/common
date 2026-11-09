import { refusalHelper } from '../../../refusal.js'
import { STACK_FRAME, WARNING_CAP } from './consts.js'
import type { ShapeHelper } from './types.js'

export const createShapeHelper = (): ShapeHelper => {
  const cut = (value: string, cap?: number): string =>
    cap != null && value.length > cap ? `${value.slice(0, cap - 1)}…` : value

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {}

  const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(isRecord) : []

  const text = (value: unknown, cap?: number): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? cut(value, cap) : undefined

  const required = (value: unknown): string => typeof value === 'string' ? value : ''

  const texts = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : []

  const textOrTexts = (value: unknown): string | string[] | undefined =>
    typeof value === 'string' ? value : Array.isArray(value) ? texts(value) : undefined

  const number = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  const flag = (value: unknown): boolean | undefined => typeof value === 'boolean' ? value : undefined

  const phrase = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || value.trim() === '') return undefined
    // The same sentence the text result says for a stored marker; anything that is not one (build
    // diagnostics somebody asked for) stands as it is, minus the frames of a stack.
    let phrased: string
    try {
      phrased = refusalHelper.refusalPhrase(value)
    } catch {
      phrased = value
    }
    const kept = phrased.split('\n').filter(line => !STACK_FRAME.test(line)).join('\n').trim()

    return kept !== '' ? cut(kept, WARNING_CAP) : undefined
  }

  const phrases = (values: unknown): string[] =>
    Array.isArray(values) ? values.map(phrase).filter((item): item is string => item != null) : []

  const nonEmpty = <T>(values: T[]): T[] | undefined => values.length > 0 ? values : undefined

  const compact = <T extends object>(value: T): T =>
    Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T

  return { isRecord, record, records, text, required, texts, textOrTexts, number, flag, phrase, phrases, nonEmpty, compact }
}

export const shapeHelper = createShapeHelper()
