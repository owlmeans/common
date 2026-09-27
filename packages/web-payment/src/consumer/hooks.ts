import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CallArguments, RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import {
  reviveConsentResponse, reviveConsentView, reviveReceipt, reviveStartResponse, reviveWithdrawalList,
} from '@owlmeans/payment'
import type {
  CancellationBody, DeclarationReceipt, PerformanceConsentBody, PerformanceConsentResponse, PerformanceConsentView,
  SubscriptionStartBody, SubscriptionStartQuery, SubscriptionStartResponse, SubscriptionStartView, WithdrawalBody,
  WithdrawalCandidateList,
} from '@owlmeans/payment'
import { makeAsker, type EnsureOptions } from './ensure.js'
import { isConsentRefusal } from './refusal.js'
import type {
  LegalLinksSource, PerformanceConsentDialogProps, SubscriptionStartDialogProps,
} from './types.js'

/** A protocol whose request carries `body`: the record, withdraw and cancel routes. */
type BodyRequest<Body> = RequestShape & { body: Body }

/** One call argument built by the hook — the protocol's own `CallArguments`, completed here. */
const argsOf = <Request extends RequestShape>(request: object): CallArguments<Request> =>
  [request] as unknown as CallArguments<Request>

export interface UsePerformanceConsentOptions {
  /** Read the view on mount, so `required` is known before anything asks. Default `false`. */
  enabled?: boolean
  uiLanguage?: string
  links?: LegalLinksSource
  /** Open the withdrawal function; the consent dialog closes (declined) first. */
  onWithdraw?: () => void
  /** After the consent was recorded — refresh an account feed, say. */
  onRecorded?: (response: PerformanceConsentResponse) => void
}

export interface PerformanceConsentControl {
  view: PerformanceConsentView | null
  /** From the last read; `null` before any. */
  required: boolean | null
  /**
   * `true` when no consent is needed or it was confirmed and recorded, `false` on a decline or a
   * closed dialog. Reads the view fresh; a failed read answers `true`. Concurrent calls share one
   * pending answer — one dialog.
   */
  ensure: (opts?: EnsureOptions) => Promise<boolean>
  refresh: () => Promise<PerformanceConsentView | null>
  /** Spread into ONE `PerformanceConsentDialog`. */
  dialog: PerformanceConsentDialogProps
}

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
    const next = reviveConsentView(await viewRef.current.call())
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
      const response = reviveConsentResponse(await recordRef.current.call(...argsOf<RecordRequest>({ body })))
      setCurrent(held => held == null ? held : { ...held, required: false, purchases: [] })
      setOpen(false)
      asker.settle(true)
      optsRef.current.onRecorded?.(response)
    } catch (e) {
      setError(true)
      // A stale text version is refused with a 428: show the current wording to confirm again.
      if (isConsentRefusal(e)) void load().catch(() => undefined)
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

export interface UseSubscriptionStartOptions {
  uiLanguage?: string
  links?: LegalLinksSource
  onWithdraw?: () => void
}

export interface SubscriptionStartParams {
  /** The plan's title as the application names it — part of the statement. */
  planTitle: string
  /** The price line the dialog shows above the statement. */
  price?: ReactNode
}

export interface SubscriptionStartControl {
  /**
   * The start request id to send with the subscription checkout (`CreateCheckoutBody.
   * startRequestId`); `''` when none is needed (or the view could not be read — the checkout's
   * own refusal then decides); `null` when the person declined or closed the dialog.
   */
  ensure: (planSku: string, params: SubscriptionStartParams) => Promise<string | null>
  view: SubscriptionStartView | null
  /** Spread into ONE `SubscriptionStartDialog`. */
  dialog: SubscriptionStartDialogProps
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
      const response = reviveStartResponse(await recordRef.current.call(...argsOf<RecordRequest>({ body })))
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

export interface DeclarationControl<Body, Receipt> {
  /** Send the declaration; the revived receipt, or `null` when it failed (`error` holds why). */
  submit: (body: Body) => Promise<Receipt | null>
  receipt: Receipt | null
  pending: boolean
  error: unknown
  /** Forget the receipt and the error — before the form is shown again. */
  reset: () => void
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
      const answer = reviveReceipt(await entryRef.current.call(...argsOf<Request>({ body })))
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

export interface WithdrawalControl<Receipt extends DeclarationReceipt> extends DeclarationControl<WithdrawalBody, Receipt> {
  /** In-app: the contracts that can still be withdrawn from; `null` before the first read. */
  list: WithdrawalCandidateList | null
  load: () => Promise<WithdrawalCandidateList | null>
  /** Spread into a `WithdrawalForm` / `WithdrawalDialog` (with `mode` and `language`). */
  form: {
    list: WithdrawalCandidateList | null
    pending: boolean
    error: boolean
    receipt: Receipt | null
    onSubmit: (body: WithdrawalBody) => Promise<Receipt | null>
  }
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
      const next = reviveWithdrawalList(await listRef.current.call())
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

export interface CancellationControl<Receipt extends DeclarationReceipt> extends DeclarationControl<CancellationBody, Receipt> {
  /** Spread into a `CancellationForm` (with `mode` and `language`). */
  form: {
    pending: boolean
    error: boolean
    receipt: Receipt | null
    onSubmit: (body: CancellationBody) => Promise<Receipt | null>
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
