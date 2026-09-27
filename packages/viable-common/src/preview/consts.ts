/**
 * Enum for OwlMeans preview integration event types
 */
export enum PreviewEventType {
  Error = 'OWLMEANS_PREVIEW_ERROR',
  CaughtError = 'OWLMEANS_PREVIEW_CONSOLE_ERROR',
  PromiseRejection = 'OWLMEANS_PREVIEW_PROMISE_REJECTION',
  FetchError = 'OWLMEANS_PREVIEW_FETCH_ERROR',
}
