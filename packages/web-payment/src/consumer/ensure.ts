import { ConsentKind } from '@owlmeans/payment'
import { ConsentDeclined } from './errors.js'
import { consentRefusalHelper } from './refusal.js'
import type { Asker, AskerOptions, ConsentGate } from './types.js'

/**
 * Read a view, show it when it asks for something, and answer once the person has — the state
 * machine behind `usePerformanceConsent().ensure` and `useSubscriptionStart().ensure`, free of
 * React so it is testable on its own. A burst of calls opens one dialog: they all get its answer.
 */
export const makeAsker = <Args extends unknown[], View, Answer>(
  opts: AskerOptions<Args, View, Answer>,
): Asker<Args, Answer> => {
  let inflight: Promise<Answer> | null = null
  let resolver: ((answer: Answer) => void) | null = null

  const run = async (args: Args): Promise<Answer> => {
    let view: View
    try {
      view = await opts.load(...args)
    } catch {
      return opts.skip
    }
    if (!opts.required(view)) {
      return opts.skip
    }

    return await new Promise<Answer>(resolve => {
      resolver = resolve
      opts.show(view)
    })
  }

  return {
    ask: async (...args) => {
      if (inflight == null) {
        inflight = run(args).finally(() => {
          inflight = null
          resolver = null
        })
      }

      return await inflight
    },
    settle: answer => {
      const resolve = resolver
      resolver = null
      resolve?.(answer)
    },
    waiting: () => resolver != null,
  }
}

/** A gate over an `ensure` — what `useConsentGate` answers inside a `PerformanceConsentProvider`. */
export const makeConsentGate = (ensure: ConsentGate['ensure']): ConsentGate => ({
  ensure,
  withConsent: async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action()
    } catch (e) {
      if (!consentRefusalHelper.isPerformanceConsentRefusal(e)) {
        throw e
      }
      if (!await ensure({ force: true })) {
        throw new ConsentDeclined(ConsentKind.Performance)
      }

      return await action()
    }
  },
})

/**
 * The gate outside any provider: nothing can be asked, so `ensure` answers `true` and a refusal
 * propagates unchanged.
 */
export const passThroughGate: ConsentGate = {
  ensure: async () => true,
  withConsent: async action => await action(),
}
