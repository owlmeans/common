import { SCALAR_KEYS } from './consts.local.js'
import type { JsonHelper } from './json/types.js'

export const createJsonHelper = (): JsonHelper => {
  const tryParse = (text: string): unknown => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }

  const parseJsonContent = (content: unknown): unknown => {
    let text: string
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      text = content.map(part => typeof part === 'object' && part !== null && 'text' in (part as Record<string, unknown>)
        ? String((part as Record<string, unknown>).text) : '').join('')
    } else {
      return null
    }

    text = text.trim()
    if (text === '') return null

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence != null) text = fence[1]!.trim()

    const whole = tryParse(text)
    if (whole !== undefined) return whole

    const firstObj = text.indexOf('{')
    const lastObj = text.lastIndexOf('}')
    if (firstObj >= 0 && lastObj > firstObj) {
      const parsed = tryParse(text.slice(firstObj, lastObj + 1))
      if (parsed !== undefined) return parsed
    }

    const firstArr = text.indexOf('[')
    const lastArr = text.lastIndexOf(']')
    if (firstArr >= 0 && lastArr > firstArr) {
      const parsed = tryParse(text.slice(firstArr, lastArr + 1))
      if (parsed !== undefined) return parsed
    }

    return null
  }

  const coerceToSchema = (value: unknown, schema: unknown): unknown => {
    if (schema == null || typeof schema !== 'object') return value
    const s = schema as { type?: string; properties?: Record<string, unknown>; items?: unknown }
    const type = s.type

    if (typeof value === 'string' && type != null && type !== 'string') {
      if (type === 'array' || type === 'object') {
        try {
          return coerceToSchema(JSON.parse(value), schema)
        } catch {
          return value
        }
      }
      if (type === 'integer' || type === 'number') {
        const n = Number(value)
        return Number.isNaN(n) ? value : n
      }
      if (type === 'boolean') {
        if (value === 'true') return true
        if (value === 'false') return false
        return value
      }
    }

    if (type === 'string' && value != null && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>
      for (const key of SCALAR_KEYS) {
        if (typeof obj[key] === 'string') return obj[key]
      }
      const strings = Object.values(obj).filter((v): v is string => typeof v === 'string')
      if (strings.length === 1) return strings[0]
    }

    if (type === 'object' && s.properties != null && value != null
      && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>
      for (const [key, propSchema] of Object.entries(s.properties)) {
        if (key in obj) obj[key] = coerceToSchema(obj[key], propSchema)
      }
      return obj
    }

    if (type === 'array' && Array.isArray(value) && s.items != null) {
      return value.map(item => coerceToSchema(item, s.items))
    }

    return value
  }

  return { parseJsonContent, coerceToSchema }
}

export const jsonHelper = createJsonHelper()

/** @deprecated compat:factory-refactor — use `jsonHelper.parseJsonContent(…)` */
export const parseJsonContent = (content: unknown): unknown => jsonHelper.parseJsonContent(content)

/** @deprecated compat:factory-refactor — use `jsonHelper.coerceToSchema(…)` */
export const coerceToSchema = (value: unknown, schema: unknown): unknown => jsonHelper.coerceToSchema(value, schema)
