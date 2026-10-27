/**
 * The bot store conformance suite — runner-agnostic: a store's own spec registers its four
 * resources on a context, builds `makeBotConformanceSubject(context)` and loops over
 * `botConformanceCasesFor(capabilities)`; a case throws `BotConformanceFailure` when an expectation
 * does not hold. Every case works in its own scope, so one database serves them all.
 */
export type * from './types.js'
export type * from './assert/types.js'
export * from './consts.js'
export * from './errors.js'
export * from './assert.js'
export * from './subject.js'
export * from './cases.js'
