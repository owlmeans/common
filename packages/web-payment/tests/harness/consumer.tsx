import { useState, type ReactElement } from 'react'
import type { RegisteredEntrypoint } from '@owlmeans/entrypoint'
import type {
  CancellationBody, DeclarationReceipt, PerformanceConsentBody, PerformanceConsentResponse, PerformanceConsentView,
  PriceEstimate, WithdrawalBody, WithdrawalCandidateList,
} from '@owlmeans/payment'
import { AmountCheckoutDialog, PriceEstimateSummary, usePriceEstimate } from '../../src/index.js'
import {
  CancellationForm, PerformanceConsentDialog, PerformanceConsentProvider, SubscriptionStartDialog, WithdrawalDialog,
  WithdrawalForm, WithdrawalFunctionButton, isConsentDeclined, useCancellation, useConsentGate, useWithdrawal,
} from '../../src/consumer/index.js'
import {
  BLOCKED_LIMIT, LINKS, PER_PURCHASE_LIMIT, POLICY, cancellationReceipt, consentView, lockedEstimate, publicReceipt,
  startView, withdrawalList, withdrawalReceipt,
} from './consumer-fixtures.js'

const params = new URLSearchParams(window.location.search)
const lng = params.get('lng') ?? 'en'

/** A fake bound protocol: records the request and answers after a short, real delay. */
const fake = <Response,>(answer: (request: { body?: unknown }) => Response, record?: (request: unknown) => void) => ({
  call: async (request: { body?: unknown } = {}) => {
    record?.(request)
    await new Promise(resolve => setTimeout(resolve, 50))
    return answer(request)
  },
}) as unknown as RegisteredEntrypoint<any, Response>

const Output = ({ id, value }: { id: string, value: unknown }) =>
  <output id={id}>{value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)}</output>

const ConsentCase = () => {
  const [open, setOpen] = useState(true)
  const [result, setResult] = useState<unknown>(null)
  return <main className="p-6">
    <Output id="consent-result" value={result} />
    <Output id="dialog-state" value={open ? 'open' : 'closed'} />
    <PerformanceConsentDialog
      open={open} onOpenChange={setOpen} view={consentView(lng)} links={LINKS}
      onConfirm={body => { setResult(body); setOpen(false) }}
      onDecline={() => { setResult('declined'); setOpen(false) }}
    />
  </main>
}

const StartCase = () => {
  const [open, setOpen] = useState(true)
  const [result, setResult] = useState<unknown>(null)
  return <main className="p-6">
    <Output id="start-result" value={result} />
    <SubscriptionStartDialog
      open={open} onOpenChange={setOpen} view={startView(lng)} planTitle="Pro" links={LINKS}
      price={<span>€20.00 / month</span>}
      onConfirm={body => { setResult(body); setOpen(false) }}
      onDecline={() => { setResult('declined'); setOpen(false) }}
    />
  </main>
}

const WithdrawalCase = () => {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState<unknown>(null)
  const [entries] = useState(() => ({
    list: fake<WithdrawalCandidateList>(() => withdrawalList(lng)),
    withdraw: fake<DeclarationReceipt>(() => withdrawalReceipt, request => setSent((request as { body: WithdrawalBody }).body)),
  }))
  const withdrawal = useWithdrawal(entries.list, entries.withdraw, { enabled: true })
  return <main className="grid gap-4 p-6">
    <Output id="withdrawal-body" value={sent} />
    <div><WithdrawalFunctionButton language={lng} onClick={() => setOpen(true)} /></div>
    <WithdrawalDialog
      open={open} onOpenChange={next => { setOpen(next); if (!next) withdrawal.reset() }}
      mode="in-app" language={lng} {...withdrawal.form}
    />
  </main>
}

const WithdrawalPublicCase = () => {
  const [sent, setSent] = useState<unknown>(null)
  const [entry] = useState(() => fake<DeclarationReceipt>(() => publicReceipt, request => setSent((request as { body: WithdrawalBody }).body)))
  const withdrawal = useWithdrawal(null, entry)
  return <main className="p-6">
    <Output id="withdrawal-body" value={sent} />
    <WithdrawalForm mode="public" language={lng} {...withdrawal.form} />
  </main>
}

const CancellationCase = () => {
  const [sent, setSent] = useState<unknown>(null)
  const [printed, setPrinted] = useState(false)
  const [entry] = useState(() => fake<DeclarationReceipt>(() => cancellationReceipt, request => setSent((request as { body: CancellationBody }).body)))
  const cancellation = useCancellation(entry)
  return <main className="p-6">
    <Output id="cancellation-body" value={sent} />
    <Output id="printed" value={printed ? 'printed' : ''} />
    <CancellationForm mode="public" language={lng} onPrint={() => setPrinted(true)} {...cancellation.form} />
  </main>
}

const LimitCase = () => {
  const [open, setOpen] = useState(true)
  const [confirmed, setConfirmed] = useState<number | null>(null)
  const blocked = params.get('blocked') === 'true'
  return <main className="p-6">
    <Output id="confirmed" value={confirmed == null ? '' : String(confirmed)} />
    <AmountCheckoutDialog
      open={open} onOpenChange={setOpen} policy={POLICY} onConfirm={setConfirmed}
      limit={blocked ? BLOCKED_LIMIT : PER_PURCHASE_LIMIT}
      legalNote={<span data-harness-legal-note="">Only unused credits are reimbursed on withdrawal.</span>}
    />
  </main>
}

const CountryLockedCase = () => {
  const [requested, setRequested] = useState<string[]>([])
  const [entry] = useState(() => fake<PriceEstimate>(
    () => lockedEstimate(2_000),
    request => setRequested(held => [...held, (request as { body?: { country?: string } }).body?.country ?? '']),
  ))
  const estimate = usePriceEstimate(entry, { enabled: true })
  return <main className="p-6">
    <Output id="requested" value={requested} />
    <Output id="locked" value={String(estimate.locked === true)} />
    <PriceEstimateSummary control={estimate} subtotalMinor={2_000} currency="usd" />
  </main>
}

/** `withConsent` against a protocol refused ONCE with a bare 428 — a production incident body. */
const GateButtons = () => {
  const gate = useConsentGate()
  const [result, setResult] = useState('')
  const [calls, setCalls] = useState(0)
  const [refusals] = useState(() => ({ left: 1 }))
  const run = async () => {
    let made = 0
    try {
      await gate.withConsent(async () => {
        made++
        setCalls(made)
        if (refusals.left > 0) {
          refusals.left--
          throw new Error('api:client:status:428:0b6f8a3e-8f0e-4b9f-9c55-2f1f0f6f2a11')
        }
        return 'done'
      })
      setResult(`ok:${made}`)
    } catch (e) {
      setResult(isConsentDeclined(e) ? `declined:${made}` : `error:${made}`)
    }
  }
  const ensure = async () => { setResult(`ensure:${String(await gate.ensure())}`) }
  return <>
    <Output id="gate-result" value={result} />
    <Output id="gate-calls" value={String(calls)} />
    <button type="button" id="gate-run" onClick={() => void run()}>Run</button>
    <button type="button" id="gate-ensure" onClick={() => void ensure()}>Ensure</button>
  </>
}

const ConsentGateCase = () => {
  const [state] = useState(() => ({ consented: false }))
  const [recorded, setRecorded] = useState<unknown>(null)
  const [entries] = useState(() => ({
    view: fake<PerformanceConsentView>(() => JSON.parse(JSON.stringify(
      state.consented ? { ...consentView(lng), required: false, purchases: [] } : consentView(lng),
    ))),
    record: fake<PerformanceConsentResponse>(request => {
      state.consented = true
      const body = (request as { body: PerformanceConsentBody }).body
      return { consentId: 'cons_1', consentedAt: new Date().toISOString(), purchaseIds: body.purchaseIds, mailed: true } as never
    }, request => setRecorded((request as { body: unknown }).body)),
  }))
  return <main className="grid gap-2 p-6">
    <Output id="recorded" value={recorded} />
    <PerformanceConsentProvider view={entries.view} record={entries.record} options={{ links: LINKS }}>
      <GateButtons />
    </PerformanceConsentProvider>
  </main>
}

const CASES: Record<string, () => ReactElement> = {
  consent: ConsentCase,
  start: StartCase,
  withdrawal: WithdrawalCase,
  'withdrawal-public': WithdrawalPublicCase,
  cancellation: CancellationCase,
  limit: LimitCase,
  'country-locked': CountryLockedCase,
  'consent-gate': ConsentGateCase,
}

export const isConsumerCase = (name: string | null): name is string => name != null && name in CASES

export const ConsumerCase = ({ name }: { name: string }) => {
  const Case = CASES[name]
  return <Case />
}
