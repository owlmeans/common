/**
 * Enum for OwlMeans preview integration event types
 */
export enum PreviewEventType {
  Error = 'OWLMEANS_PREVIEW_ERROR',
  CaughtError = 'OWLMEANS_PREVIEW_CONSOLE_ERROR',
  PromiseRejection = 'OWLMEANS_PREVIEW_PROMISE_REJECTION',
  FetchError = 'OWLMEANS_PREVIEW_FETCH_ERROR',
  /** An analytics event a target's web logged through `@owlmeans/log` (browser → manager frame). */
  Analytics = 'OWLMEANS_PREVIEW_ANALYTICS',
}
