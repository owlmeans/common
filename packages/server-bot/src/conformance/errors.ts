/** A conformance expectation that did not hold. Plain `Error`, so any test runner reports it. */
export class BotConformanceFailure extends Error {
  constructor(message: string) {
    super(`bot conformance: ${message}`)
    this.name = 'BotConformanceFailure'
  }
}
