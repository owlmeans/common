/**
 * The planning store conformance suite — a framework-agnostic list of named cases every
 * `PlanningStore` answers identically. No test runner is imported: a store's own spec file loops
 * over {@link conformanceCasesFor} and hands each case a {@link ConformanceSubject}; a case throws
 * `ConformanceFailure` (a plain `Error`) when an expectation does not hold.
 */
export * from './assert.js'
export * from './cases.js'
export * from './fixtures.js'
