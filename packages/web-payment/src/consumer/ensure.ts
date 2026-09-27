import { ConsentKind } from '@owlmeans/payment'
import { ConsentDeclined, isPerformanceConsentRefusal } from './refusal.js'

export interface AskerOptions<Args extends unknown[], View, Answer> {
  /** Read the current view. */
  load: (...args: Args) => Promise<View>
  /** Whether the view asks the person anything. */
  required: (view: View) => boolean
  /** Show the view to the person (open the dialog). */
  show: (view: View) => void
  /**
   * The answer when nothing needs asking — and when the read FAILS: the server's refusal stays
   * the authority, and a flaky read must never block work that needs no consent.
   */
  skip: Answer
}

export interface Asker<Args extends unknown[], Answer> {
  /** Read, and ask only when the view requires it. Concurrent calls share ONE pending answer. */
  ask: (...args: Args) => Promise<Answer>
  /** Answer the pending `ask` (the dialog confirmed or was declined); nothing when none waits. */
  settle: (answer: Answer) => void
  /** Whether an `ask` is waiting for the person. */
  waiting: () => boolean
}

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

export interface EnsureOptions {
  /**
   * Asked after the server refused with a 428 although the last answer said nothing was needed.
   * The view is always read fresh; `force` records why the caller asks.
   */
  force?: boolean
}

export interface ConsentGate {
  /**
   * `true` when nothing needs consent or the person confirmed and it was recorded; `false` when
   * they declined or closed the dialog. A failed read answers `true`. One pending answer is shared.
   */
  ensure: (opts?: EnsureOptions) => Promise<boolean>
  /**
   * Run `action`; when it is refused for the spend consent (`isPerformanceConsentRefusal` — the
   * class, its marker, or a bare 428, also wrapped inside another error), ask with
   * `ensure({ force: true })` and run it again exactly ONCE. A decline throws `ConsentDeclined`;
   * a second refusal, or any other failure, propagates as it is.
   */
  withConsent: <T>(action: () => Promise<T>) => Promise<T>
}

/** A gate over an `ensure` — what `useConsentGate` answers inside a `PerformanceConsentProvider`. */
export const makeConsentGate = (ensure: ConsentGate['ensure']): ConsentGate => ({
  ensure,
  withConsent: async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action()
    } catch (e) {
      if (!isPerformanceConsentRefusal(e)) {
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
