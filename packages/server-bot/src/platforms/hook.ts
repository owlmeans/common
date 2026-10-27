import { timingSafeEqual } from 'node:crypto'
import type { BotHookRequest } from '../types.js'
import type { BotHookHelper } from './hook/types.js'

export const createBotHookHelper = (): BotHookHelper => {
  const header = (request: BotHookRequest, name: string): string | undefined => {
    const wanted = name.toLowerCase()
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      if (key.toLowerCase() === wanted) {
        return Array.isArray(value) ? value[0] : value
      }
    }

    return undefined
  }

  const rawText = (request: BotHookRequest): string => {
    const raw = request.rawBody
    if (typeof raw === 'string') {
      return raw
    }
    if (raw != null) {
      return Buffer.from(raw).toString('utf8')
    }

    return request.body == null ? '' : JSON.stringify(request.body)
  }

  const json = (request: BotHookRequest): unknown => {
    if (request.body != null && typeof request.body === 'object') {
      return request.body
    }
    const text = request.rawBody != null ? rawText(request) : typeof request.body === 'string' ? request.body : ''
    if (text.trim() === '') {
      return null
    }
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const sameSecret = (presented: string | undefined, expected: string | undefined): boolean => {
    if (typeof presented !== 'string' || typeof expected !== 'string' || expected === '') {
      return false
    }
    const left = Buffer.from(presented, 'utf8')
    const right = Buffer.from(expected, 'utf8')

    return left.length === right.length && timingSafeEqual(left, right)
  }

  return { header, rawText, json, sameSecret }
}

export const botHookHelper = createBotHookHelper()
