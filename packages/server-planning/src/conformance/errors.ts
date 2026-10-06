/** A conformance expectation that did not hold. Plain `Error`, so any test runner reports it. */
export class ConformanceFailure extends Error {
  constructor(message: string) {
    super(`planning conformance: ${message}`)
    this.name = 'ConformanceFailure'
  }
}
