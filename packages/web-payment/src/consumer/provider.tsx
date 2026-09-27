import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import type { PerformanceConsentBody, PerformanceConsentResponse, PerformanceConsentView } from '@owlmeans/payment'
import { makeConsentGate, passThroughGate, type ConsentGate } from './ensure.js'
import { usePerformanceConsent, type UsePerformanceConsentOptions } from './hooks.js'
import { PerformanceConsentDialog } from './performance-consent-dialog.js'

export interface ConsentGateValue extends ConsentGate {
  /** From the last read of the view; `null` before any, and always outside a provider. */
  required: boolean | null
}

const ConsentGateContext = createContext<ConsentGateValue | null>(null)

export interface PerformanceConsentProviderProps<RecordRequest extends RequestShape & { body: PerformanceConsentBody }> {
  view: RegisteredEntrypoint<{}, PerformanceConsentView>
  record: RegisteredEntrypoint<RecordRequest, PerformanceConsentResponse>
  options?: UsePerformanceConsentOptions
  children?: ReactNode
}

/**
 * ONE spend-consent dialog for the whole application, and the gate every action that may spend
 * credits reads with `useConsentGate()`: however many buttons ask at once, one dialog opens and
 * they all get its answer.
 */
export const PerformanceConsentProvider = <RecordRequest extends RequestShape & { body: PerformanceConsentBody }>({
  view, record, options, children,
}: PerformanceConsentProviderProps<RecordRequest>) => {
  const consent = usePerformanceConsent(view, record, options)
  const { ensure, required } = consent
  const value = useMemo<ConsentGateValue>(() => ({ ...makeConsentGate(ensure), required }), [ensure, required])

  return <ConsentGateContext.Provider value={value}>
    {children}
    <PerformanceConsentDialog {...consent.dialog} />
  </ConsentGateContext.Provider>
}

/**
 * The application's consent gate: `ensure()` asks proactively, `withConsent(action)` runs an
 * action and, when it is refused for the spend consent, asks and retries it exactly once
 * (`ConsentDeclined` on a decline). Outside a `PerformanceConsentProvider` nothing can be asked:
 * `ensure` answers `true` and a refusal propagates unchanged.
 */
export const useConsentGate = (): ConsentGateValue =>
  useContext(ConsentGateContext) ?? PASS_THROUGH

const PASS_THROUGH: ConsentGateValue = { ...passThroughGate, required: null }
