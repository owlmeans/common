import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nContext } from '@owlmeans/client-i18n'
import { AmountCheckoutDialog } from '../../src/index.js'

const params = new URLSearchParams(window.location.search)
const pending = params.get('pending') === 'true'
const policy = {
  currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
  presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
}

const App = () => {
  const [open, setOpen] = useState(true)
  const [confirmed, setConfirmed] = useState<number | null>(null)
  return <I18nContext config={{ service: 'web-payment-test', i18n: { defaultLng: 'en' } } as never}>
    <output id="dialog-state">{open ? 'open' : 'closed'}</output>
    <output id="confirmed">{confirmed ?? ''}</output>
    <AmountCheckoutDialog
      open={open}
      onOpenChange={setOpen}
      policy={policy}
      pending={pending}
      onConfirm={setConfirmed}
    />
  </I18nContext>
}

createRoot(document.getElementById('root')!).render(<App />)
