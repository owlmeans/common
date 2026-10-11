import { MAX_CAUSE_DEPTH } from './consts.local.js'
import type { PluginUtils } from './utils/types.js'

export const createPluginUtils = (): PluginUtils => {
  const makeConfiguration = (
    { baseURL, headers }: { baseURL: string | undefined, headers: Record<string, string> | undefined }
  ): { configuration: Record<string, unknown> } | Record<string, never> => {
    const hasBaseURL = baseURL != null
    const hasHeaders = headers != null && Object.keys(headers).length > 0
    if (!hasBaseURL && !hasHeaders) return {}
    return {
      configuration: {
        ...(hasBaseURL ? { baseURL } : {}),
        ...(hasHeaders ? { defaultHeaders: headers } : {}),
      }
    }
  }

  const makeClientOptions = (
    { headers }: { headers: Record<string, string> | undefined }
  ): { clientOptions: Record<string, unknown> } | Record<string, never> => {
    if (headers == null || Object.keys(headers).length === 0) return {}
    return { clientOptions: { defaultHeaders: headers } }
  }

  const escalateMaxTokens = (base: number | undefined, attempt: number, cap: number): number =>
    Math.min((base ?? 2048) * Math.pow(2, attempt), cap)

  const isBadRequest = (e: unknown): boolean => {
    let current: unknown = e
    for (let depth = 0; current != null && depth < MAX_CAUSE_DEPTH; ++depth) {
      if ((current as { status?: unknown }).status === 400) return true
      const cause = (current as { cause?: unknown }).cause
      if (cause === current) return false
      current = cause
    }
    return false
  }

  return { makeConfiguration, makeClientOptions, escalateMaxTokens, isBadRequest }
}

export const pluginUtils = createPluginUtils()
