import type { PreviewEventType } from './consts.js'

/**
 * Base interface for all OwlMeans preview messages
 */
export interface OwlMeansPreviewMessage<T extends OwlMenasPreviewPayloads = OwlMenasPreviewPayloads> {
  type: PreviewEventType
  payload: T
}

export interface OwlMeansCaughtErrorPayload {
  message: string
  stack?: string
}

/**
 * Payload for global error events
 */
export interface OwlMeansErrorPayload {
  message: string
  source: string
  line: number
  col: number
  stack?: string
}

/**
 * Payload for unhandled promise rejection events
 */
export interface OwlMeansPromiseRejectionPayload {
  reason: unknown
  stack?: string
}

/**
 * Payload for fetch error events
 */
export interface OwlMeansFetchErrorPayload {
  url: string | URL | Request
  options?: RequestInit
  status: number
  statusText: string
  body: string
  /** Server-labelled auth/IAM refusal; absent for unrelated HTTP failures. */
  denialKind?: string
  incidentId?: string
}

/**
 * Payload of an analytics event of a target's web — `AnalyticsEvent` of `@owlmeans/log`, as the
 * target's `viablePreviewPlugin` posts it. Untrusted: it comes from generated code.
 */
export interface OwlMeansAnalyticsPayload {
  event: string
  scope: string
  time: number
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  data?: unknown
}

/**
 * Specific message types for each event kind
 */
export interface OwlMeansErrorMessage extends OwlMeansPreviewMessage<OwlMeansErrorPayload> {
  type: PreviewEventType.Error
}

export interface OwlMeansPromiseRejectionMessage extends OwlMeansPreviewMessage<OwlMeansPromiseRejectionPayload> {
  type: PreviewEventType.PromiseRejection
}

export interface OwlMeansFetchErrorMessage extends OwlMeansPreviewMessage<OwlMeansFetchErrorPayload> {
  type: PreviewEventType.FetchError
}

export interface OwlMeansCaughtErrorMessage extends OwlMeansPreviewMessage<OwlMeansCaughtErrorPayload> {
  type: PreviewEventType.CaughtError
}

export interface OwlMeansAnalyticsMessage extends OwlMeansPreviewMessage<OwlMeansAnalyticsPayload> {
  type: PreviewEventType.Analytics
}

/**
 * Union type for all possible OwlMeans preview messages
 */
export type OwlMeansPreviewMessages = 
  | OwlMeansErrorMessage 
  | OwlMeansPromiseRejectionMessage 
  | OwlMeansFetchErrorMessage
  | OwlMeansCaughtErrorMessage
  | OwlMeansAnalyticsMessage

export type OwlMenasPreviewPayloads = 
  | OwlMeansErrorPayload
  | OwlMeansPromiseRejectionPayload
  | OwlMeansFetchErrorPayload
  | OwlMeansCaughtErrorPayload
  | OwlMeansAnalyticsPayload
