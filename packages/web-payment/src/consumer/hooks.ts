import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CallArguments, RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import { type CancellationBody, type DeclarationReceipt, type PerformanceConsentBody, type PerformanceConsentResponse, type PerformanceConsentView, type SubscriptionStartBody, type SubscriptionStartQuery, type SubscriptionStartResponse, type SubscriptionStartView, type WithdrawalBody, type WithdrawalCandidateList, consumerReviveHelper } from '@owlmeans/payment'
import { fixedTextHelper } from './copy.js'
import { makeAsker } from './ensure.js'
import { consentRefusalHelper } from './refusal.js'
import type { FixedText, LegalText, PerformanceConsentDialogProps, SubscriptionStartDialogProps, CancellationControl, DeclarationControl, PerformanceConsentControl, SubscriptionStartControl, SubscriptionStartParams, UsePerformanceConsentOptions, UseSubscriptionStartOptions, WithdrawalControl } from './types.js'
import type { BodyRequest } from './types.local.js'

/** One call argument built by the hook — the protocol's own `CallArguments`, completed here. */
const argsOf = <Request extends RequestShape>(request: object): CallArguments<Request> =>
  [request] as unknown as CallArguments<Request>

/**
 * The spend consent over two protocols — the view (`consent` GET) and the record (`giveConsent`
 * POST) of `makeConsumerRightsProtocols` — bound with `ctx.entrypoint(protocol)`.
 */
export const usePerformanceConsent = <RecordRequest extends BodyRequest<PerformanceConsentBody>>(
  view: RegisteredEntrypoint<{}, PerformanceConsentView>,
  record: RegisteredEntrypoint<RecordRequest, PerformanceConsentResponse>,
  opts: UsePerformanceConsentOptions = {},
): PerformanceConsentControl => {
  const viewRef = useRef(view)
  viewRef.current = view
  const recordRef = useRef(record)
  recordRef.current = record
  const optsRef = useRef(opts)
  optsRef.current = opts

  const [current, setCurrent] = useState<PerformanceConsentView | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async (): Promise<PerformanceConsentView> => {
    const next = consumerReviveHelper.reviveConsentView(await viewRef.current.call())
    setCurrent(next)

    return next
  }, [])
  const asker = useMemo(() => makeAsker<[], PerformanceConsentView, boolean>({
    load, required: next => next.required, skip: true,
    show: () => { setError(false); setOpen(true) },
  }), [load])

  useEffect(() => {
    if (opts.enabled === true) void load().catch(() => undefined)
  }, [opts.enabled, load])

  const decline = useCallback(() => {
    setOpen(false)
    asker.settle(false)
  }, [asker])

  const onConfirm = useCallback(async (body: PerformanceConsentBody) => {
    setPending(true)
    setError(false)
    try {
      const response = consumerReviveHelper.reviveConsentResponse(await recordRef.current.call(...argsOf<RecordRequest>({ body })))
      setCurrent(held => held == null ? held : { ...held, required: false, purchases: [] })
      setOpen(false)
      asker.settle(true)
      optsRef.current.onRecorded?.(response)
    } catch (e) {
      setError(true)
      // A stale text version is refused with a 428: show the current wording to confirm again.
      if (consentRefusalHelper.isConsentRefusal(e)) void load().catch(() => undefined)
    } finally {
      setPending(false)
    }
  }, [asker, load])

  const refresh = useCallback(async () => {
    try {
      return await load()
    } catch {
      return null
    }
  }, [load])

  const ensure = useCallback(async () => await asker.ask(), [asker])

  const onWithdraw = opts.onWithdraw
  const dialog: PerformanceConsentDialogProps = {
    open, view: current, pending, error, onConfirm, onDecline: decline,
    onOpenChange: next => { if (next) setOpen(true); else decline() },
    uiLanguage: opts.uiLanguage,
    links: opts.links,
    onWithdraw: onWithdraw != null ? () => { decline(); onWithdraw() } : undefined,
  }

  return { view: current, required: current?.required ?? null, ensure, refresh, dialog }
}

/**
 * The subscription start request over the `start` GET (`?planSku`) and `requestStart` POST
 * protocols, asked right before a subscription checkout.
 */
export const useSubscriptionStart = <
  ViewRequest extends RequestShape & { query: SubscriptionStartQuery },
  RecordRequest extends BodyRequest<SubscriptionStartBody>,
>(
  view: RegisteredEntrypoint<ViewRequest, SubscriptionStartView>,
  record: RegisteredEntrypoint<RecordRequest, SubscriptionStartResponse>,
  opts: UseSubscriptionStartOptions = {},
): SubscriptionStartControl => {
  const viewRef = useRef(view)
  viewRef.current = view
  const recordRef = useRef(record)
  recordRef.current = record

  const [current, setCurrent] = useState<SubscriptionStartView | null>(null)
  const [params, setParams] = useState<SubscriptionStartParams>({ planTitle: '' })
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  const asker = useMemo(() => makeAsker<[string, SubscriptionStartParams], SubscriptionStartView, string | null>({
    load: async (planSku, next) => {
      const answer = await viewRef.current.call(...argsOf<ViewRequest>({ query: { planSku } }))
      setCurrent(answer)
      setParams(next)

      return answer
    },
    required: next => next.required,
    skip: '',
    show: () => { setError(false); setOpen(true) },
  }), [])

  const decline = useCallback(() => {
    setOpen(false)
    asker.settle(null)
  }, [asker])

  const onConfirm = useCallback(async (body: SubscriptionStartBody) => {
    setPending(true)
    setError(false)
    try {
      const response = consumerReviveHelper.reviveStartResponse(await recordRef.current.call(...argsOf<RecordRequest>({ body })))
      setOpen(false)
      asker.settle(response.startRequestId)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }, [asker])

  const ensure = useCallback(async (planSku: string, next: SubscriptionStartParams) => await asker.ask(planSku, next), [asker])

  const onWithdraw = opts.onWithdraw
  const dialog: SubscriptionStartDialogProps = {
    open, view: current, planTitle: params.planTitle, price: params.price, pending, error, onConfirm,
    onDecline: decline,
    onOpenChange: next => { if (next) setOpen(true); else decline() },
    uiLanguage: opts.uiLanguage,
    links: opts.links,
    onWithdraw: onWithdraw != null ? () => { decline(); onWithdraw() } : undefined,
  }

  return { ensure, view: current, dialog }
}

/** The submit half both statutory functions share: one protocol, one receipt. */
const useDeclaration = <Body, Request extends BodyRequest<Body>, Receipt extends DeclarationReceipt>(
  entry: RegisteredEntrypoint<Request, Receipt>,
): DeclarationControl<Body, Receipt> => {
  const entryRef = useRef(entry)
  entryRef.current = entry
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = useCallback(async (body: Body): Promise<Receipt | null> => {
    setPending(true)
    setError(null)
    try {
      const answer = consumerReviveHelper.reviveReceipt(await entryRef.current.call(...argsOf<Request>({ body })))
      setReceipt(answer)

      return answer
    } catch (e) {
      setError(e)

      return null
    } finally {
      setPending(false)
    }
  }, [])
  const reset = useCallback(() => {
    setReceipt(null)
    setError(null)
  }, [])

  return { submit, receipt, pending, error, reset }
}

/**
 * The withdrawal function over the `withdrawals` GET (in-app; `null` on the public page) and a
 * `withdraw` POST — the account one answers a `WithdrawalReceipt`, the public one a
 * `DeclarationReceipt`.
 */
export const useWithdrawal = <Request extends BodyRequest<WithdrawalBody>, Receipt extends DeclarationReceipt>(
  list: RegisteredEntrypoint<{}, WithdrawalCandidateList> | null,
  withdraw: RegisteredEntrypoint<Request, Receipt>,
  opts: { enabled?: boolean } = {},
): WithdrawalControl<Receipt> => {
  const listRef = useRef(list)
  listRef.current = list
  const [candidates, setCandidates] = useState<WithdrawalCandidateList | null>(null)
  const declaration = useDeclaration<WithdrawalBody, Request, Receipt>(withdraw)

  const load = useCallback(async () => {
    if (listRef.current == null) {
      return null
    }
    try {
      const next = consumerReviveHelper.reviveWithdrawalList(await listRef.current.call())
      setCandidates(next)

      return next
    } catch {
      return null
    }
  }, [])
  useEffect(() => {
    if (opts.enabled === true) void load()
  }, [opts.enabled, load])

  return {
    ...declaration,
    list: candidates,
    load,
    form: {
      list: candidates,
      pending: declaration.pending,
      error: declaration.error != null,
      receipt: declaration.receipt,
      onSubmit: declaration.submit,
    },
  }
}

/**
 * The cancellation function over a `cancel` POST — the account one answers a
 * `CancellationReceipt`, the public one a `DeclarationReceipt`.
 */
export const useCancellation = <Request extends BodyRequest<CancellationBody>, Receipt extends DeclarationReceipt>(
  cancel: RegisteredEntrypoint<Request, Receipt>,
): CancellationControl<Receipt> => {
  const declaration = useDeclaration<CancellationBody, Request, Receipt>(cancel)

  return {
    ...declaration,
    form: {
      pending: declaration.pending,
      error: declaration.error != null,
      receipt: declaration.receipt,
      onSubmit: declaration.submit,
    },
  }
}

/** `fixedTextHelper.paymentTextOf(lng)`, memoised for the language. */
export const usePaymentText = (lng: string): FixedText => useMemo(() => fixedTextHelper.paymentTextOf(lng), [lng])

/** `fixedTextHelper.legalTextOf(lng)`, memoised for the language. */
export const useLegalText = (lng: string): LegalText => useMemo(() => fixedTextHelper.legalTextOf(lng), [lng])
