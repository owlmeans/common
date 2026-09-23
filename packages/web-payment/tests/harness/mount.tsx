import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nContext } from '@owlmeans/client-i18n'
import { AmountCheckoutDialog } from '../../src/index.js'
import { ConsumerCase, isConsumerCase } from './consumer.js'
import { EntitlementCase } from './entitlement.js'
import { ESTIMATE_FIXTURES } from './estimate-fixtures.js'

const params = new URLSearchParams(window.location.search)
const pending = params.get('pending') === 'true'
const scenario = params.get('case')
const estimateCase = params.get('estimate')
const policy = {
  currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
  presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
}

const Dialog = () => {
  const [open, setOpen] = useState(true)
  const [confirmed, setConfirmed] = useState<number | null>(null)
  return <>
    <output id="dialog-state">{open ? 'open' : 'closed'}</output>
    <output id="confirmed">{confirmed ?? ''}</output>
    <AmountCheckoutDialog
      open={open}
      onOpenChange={setOpen}
      policy={policy}
      pending={pending}
      onConfirm={setConfirmed}
      estimate={estimateCase != null ? ESTIMATE_FIXTURES[estimateCase] : undefined}
    />
  </>
}

/** `?ui=` is the interface language; `?lng=` (read by the consumer cases) the contract language. */
const ui = params.get('ui') ?? 'en'
const LANGUAGES = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr']

const App = () => <I18nContext config={{ service: 'web-payment-test', i18n: { defaultLng: ui, supportedLngs: LANGUAGES } } as never}>
  {scenario == null
    ? <Dialog />
    : isConsumerCase(scenario) ? <ConsumerCase name={scenario} /> : <EntitlementCase name={scenario} />}
</I18nContext>

createRoot(document.getElementById('root')!).render(<App />)
