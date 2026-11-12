import { DEFAULT_CONSENT_CATEGORIES, consentTrackingHelper } from '@owlmeans/consent'
import type { ConsentOptions, ConsentRecord, ConsentSignalProvider } from '@owlmeans/consent'

/**
 * The harness's signal provider: a stand-in for a tag vendor's consent API, registered the way an
 * application registers a real one, so the specs can see WHAT the store signalled and WHEN.
 *
 * Everything it is asked lands on `window.__harnessSignals` as `{ step, from, granted? }`: `step` is
 * `defaults` or `apply`, `from` is `inline` (its head bootstrap, before any bundle) or `bundle` (the
 * store). Like a real provider it declares its defaults once per document, through a window flag,
 * whichever of the two gets there first.
 */
export const HARNESS_SIGNALS = '__harnessSignals'

export const HARNESS_SIGNALS_FLAG = '__harnessSignalsSetup'

export interface HarnessSignal {
  step: 'defaults' | 'apply'
  from: 'inline' | 'bundle'
  granted?: Record<string, boolean>
}

const journal = (): HarnessSignal[] => {
  const win = window as unknown as Record<string, HarnessSignal[] | undefined>
  win[HARNESS_SIGNALS] = win[HARNESS_SIGNALS] ?? []

  return win[HARNESS_SIGNALS]
}

const grantedOf = (record: ConsentRecord, opts?: ConsentOptions): Record<string, boolean> => Object.fromEntries(
  (opts?.categories ?? DEFAULT_CONSENT_CATEGORIES)
    .map(category => [category.key, category.required === true || record[category.key] === true])
)

/**
 * Composed the way a provider package composes its head output: its own defaults, then consent's
 * neutral bootstrap (linker, category globals), then its own reading of the stored record over
 * consent's inline building blocks.
 */
const bootstrapScript = (opts?: ConsentOptions): string => {
  const signals = JSON.stringify(HARNESS_SIGNALS)
  const flag = JSON.stringify(HARNESS_SIGNALS_FLAG)
  const keys = JSON.stringify((opts?.categories ?? DEFAULT_CONSENT_CATEGORIES)
    .map(category => ({ key: category.key, required: category.required === true })))

  return `(function(w){if(w[${flag}])return;w[${flag}]=true;` +
    `(w[${signals}]=w[${signals}]||[]).push({step:'defaults',from:'inline'})})(window);` +
    `${consentTrackingHelper.consentBootstrapScript(opts)};` +
    `(function(w,d){${consentTrackingHelper.storageReadScript(opts)}` +
    `if(!raw)return;var r;try{r=JSON.parse(raw)}catch(e){return}` +
    consentTrackingHelper.staleAutoScript('return') +
    `var cs=${keys},g={};for(var i=0;i<cs.length;i++){g[cs[i].key]=cs[i].required||r[cs[i].key]===true}` +
    `(w[${signals}]=w[${signals}]||[]).push({step:'apply',from:'inline',granted:g})})(window,document)`
}

export const harnessSignals: ConsentSignalProvider = {
  id: 'harness',
  defaults: () => {
    const win = window as unknown as Record<string, unknown>
    if (win[HARNESS_SIGNALS_FLAG] === true) {
      return
    }
    win[HARNESS_SIGNALS_FLAG] = true
    journal().push({ step: 'defaults', from: 'bundle' })
  },
  apply: (record, opts) => {
    journal().push({ step: 'apply', from: 'bundle', granted: grantedOf(record, opts) })
  },
  bootstrapScript,
}
