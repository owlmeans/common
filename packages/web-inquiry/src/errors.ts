import type { InquiryLoadFailure } from './types.js'

/** The widget runtime could not be loaded; `failure` says why. */
export class InquiryLoadError extends Error {
  readonly failure: InquiryLoadFailure

  constructor(failure: InquiryLoadFailure, message: string) {
    super(message)
    this.name = 'InquiryLoadError'
    this.failure = failure
  }
}
