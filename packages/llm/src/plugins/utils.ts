import { MAX_CAUSE_DEPTH } from './consts.local.js'
import type { PluginUtils } from './utils/types.js'
import type { LlmFetch } from './transport/types.js'

export const createPluginUtils = (): PluginUtils => {
  const makeConfiguration = (
    { baseURL, headers, fetch }: { baseURL: string | undefined, headers: Record<string, string> | undefined, fetch?: LlmFetch | undefined }
  ): { configuration: Record<string, unknown> } | Record<string, never> => {
    const hasBaseURL = baseURL != null
    const hasHeaders = headers != null && Object.keys(headers).length > 0
    if (!hasBaseURL && !hasHeaders && fetch == null) return {}
    return {
      configuration: {
        ...(hasBaseURL ? { baseURL } : {}),
        ...(hasHeaders ? { defaultHeaders: headers } : {}),
        ...(fetch != null ? { fetch } : {}),
      }
    }
  }

  const makeClientOptions = (
    { headers, fetch }: { headers: Record<string, string> | undefined, fetch?: LlmFetch | undefined }
  ): { clientOptions: Record<string, unknown> } | Record<string, never> => {
    const hasHeaders = headers != null && Object.keys(headers).length > 0
    if (!hasHeaders && fetch == null) return {}
    return {
      clientOptions: {
        ...(hasHeaders ? { defaultHeaders: headers } : {}),
        ...(fetch != null ? { fetch } : {}),
      }
    }
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
