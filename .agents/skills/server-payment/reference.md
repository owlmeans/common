# server-payment — consumer-rights reference

The contracts behind `SKILL.md` § Consumer rights. Types live in `src/types.ts`, schemas in
`src/model.ts`, the service in `src/consumer/service.ts`.

## Declaring

```typescript
declareConsumerRights(cfg, {
  ...ConsumerRightsDeclaration,            // @owlmeans/payment: textVersion, links (per language), mechanisms,
                                           // currencies { eu, other }, countries, withdrawalDays, deadline, …
  trader: { name, legalName, address?, email?, website? },   // backend only; required when any mechanism is on
  mail: { alias?, from?, replyTo?, bcc?: string[] },          // backend only
}): ConsumerRightsPolicy
```

- The policy is a singleton ADVERTISED config record (`CONSUMER_RIGHTS_RECORD_ID`), filled from
  `DEFAULT_CONSUMER_RIGHTS` (14 days, weekend rollover, **margin 5 days**, every mechanism off) and
  asserted; a second declaration replaces the first.
- `trader` and `mail` go to the plugin config `_external:payment-consumer-mail`
  (`CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG`), never advertised. `trader.name` fills `{{trader}}` in the
  consent and start statements; `legalName, address, email` (whatever is declared) fill it in the
  mails, the withdrawal information and the model form.
- Refusals: `ConsumerRightsError('policy:trader')` (a mechanism on, no `name`/`legalName`),
  `'policy:mail-bcc'`, and every `assertConsumerRightsPolicy` refusal.

## Records

| Record | Fields |
|---|---|
| `BillingProfileRecord` | `entityId, country, region, currency, language, source ('checkout'\|'customer'\|'manual'), paygate, customerId?, sessionId?, ipCountry?, email?, name?, business?, lockedAt, createdAt, updatedAt?` |
| `PurchaseRecord` | `purchaseId, contractRef, entityId, kind, paygate, sessionId?, subscriptionId?, paymentIntentId?, invoiceId?, invoiceNumber?, invoiceLineId?, productSku, planSku?, profileId?, country?, region?, ipCountry?, inScope, language, email?, name?, business?, currency, amountSubtotalMinor, amountTaxMinor, amountTotalMinor, presentmentCurrency?, presentmentAmountMinor?, netAmountMinor?, amountCurrency?, units?, taxBehavior?, termsAccepted?, textVersion?, copyVersion?, startRequestId?, servicesStartedAt?, confirmationMailAt?, purchasedAt, deadline?, consentId?, consentedAt?, withdrawalId?, withdrawnAt?, refundedMinor?, refundedAt?, cancellationId?, cancelEffectiveAt?, createdAt, updatedAt?` |
| `ConsumerConsentRecord` | `kind ('performance'\|'subscription-start'), entityId, profileId?, name?, email?, purchaseIds[], planSku?, planName?, textVersion, copyVersion, language, uiLanguage?, trader, text {request, acknowledgement, checkbox}, links, deadline?, decidedAt, expiresAt?` + `RequestOrigin` |
| `ConsumerDeclarationRecord` | `kind ('withdrawal'\|'cancellation'), channel ('in-app'\|'public'), entityId?, purchaseId?, subscriptionId?, contractRef?, name, email, cancellationKind?, reason?, effective?, requestedDate?, language, textVersion?, copyVersion, receivedAt, matched, profileId?, duplicateOf?, status, refundMinor?, currency?, effectiveAt?` + `RequestOrigin` |
| `ConsumerEventRecord` | `recordId, recordKind ('purchase'\|'consent'\|'declaration'\|'profile'\|'checkout'), entityId?, action, step?, ok, skipped?, externalId?, amountMinor?, currency?, detail? (JSON), error?, at` |
| `RequestOrigin` | `ip?, forwardedFor?, userAgent?, ipCountry?, acceptLanguage?, via?` |

Event actions: `mail` (step = mail kind), `computed` (the meter reading and the refund, JSON),
`meter`, `refund`, `credit-note` (step `preview` for a failed preview), `subscription-cancel`,
`cancel-scheduled`, `observers` (step = `consent`/`withdrawal`/`cancellation`), `lock`,
`lock-mismatch`, `relock`, `unlock` (detail: `from`, `by`, `reason`, the deleted `profile`),
`duplicate`, `checkout-terms-fallback` (`recordKind: 'checkout'`, `recordId` = the entity,
`externalId` = the session created without the checkbox, `ok: false`, detail: the Stripe `message`,
`code`, `param`, `mode`, `productSku`, `planSku`; `error` when the retry failed too).

`PurchaseRecord.termsAccepted` is Stripe's `consent.terms_of_service` of the completed session and
nothing else; `confirmationMailAt` is the one claim of the purchase confirmation.

Accessors (`src/utils.ts`): `billingProfiles`, `purchases`, `consumerConsents`,
`consumerDeclarations`, `consumerEvents`, `consumerRights`, `consumerRightsOf`, `conditionalSet`.

## The service (`ConsumerRightsService`, `CONSUMER_RIGHTS_SERVICE = 'payment-consumer-rights'`)

| Method | Does |
|---|---|
| `managed` | `false`: `withdraw`, `cancel` and reconcile's paygate steps refuse / skip. The application's explicit `manage`, else the gateway's, else `true` — whatever the registration order |
| `policy()` | the declared policy or `null` |
| `profile(entityId)` | the locked `BillingProfileView`, or `null` (the handler answers an unlocked view) |
| `lock(entityId, country, source, { force?, by?, reason?, currency?, … })` | first write wins; `manual` + `force` relocks (event `relock`) |
| `unlock(entityId, { by?, reason? })` | deletes the profile while it still holds the country read (else `ConsumerRightsError('unlock:changed:<id>')`), event `unlock`; answers the old view or `null`; no lazy lock from the paygate customer follows |
| `purchases(entityId, { open?, at? })` | `PurchaseView[]`, newest first; `withdrawable` asks the meter for top-ups |
| `consentView(entityId, at?)` | `PerformanceConsentView`: the open unconsented top-up windows, the billing language, the trader name, links |
| `recordConsent(subject, body, origin?)` | 428 on a stale version or a view that saw none of the open windows; covers the listed open windows |
| `assertConsent(entityId, at?)` | one indexed query; `PerformanceConsentRequired {pending, deadline}` |
| `startView(entityId, planSku, { language? })` | `SubscriptionStartView`; `required` unless locked outside the territories |
| `recordStartRequest(subject, body, origin?, { plan? })` | 428 `SubscriptionStartRequired` on a stale version; `UnknownPlan`; mails the start confirmation |
| `assertStartRequest(entityId, planSku, id?)` | the fresh request bound to entity, plan and text version, or `null` when none is needed; else 428 |
| `withdrawalCandidates(entityId, subject?)` | open windows with an estimate (a top-up fully used after consent is left out); `automatic` = refunds on, meter present, managed |
| `withdraw(subject \| null, body, origin?)` | see below |
| `cancel(subject \| null, body, origin?)` | see below |
| `useMeter(meter)` / `usageMeter()` | the application's `UsageMeter` — settable while wiring (a lazy service) |
| `useMailRenderer(fn)` / `mailRenderer()` | `(kind, data, rendered) => MailMessage \| null \| undefined` |
| `reconcile({ since?, limit? })` | `{ retried, mailed, observed, backfilled, locked, failed }` |

`ConsumerSubject { entityId, profileId?, name?, email?, channel? }` — `channel: 'public'` when the
application matched a public declaration to an organization itself (the answer stays public).

### The usage meter

```typescript
interface PurchaseRef { purchaseId; kind; entityId; contractRef; productSku; planSku?; sessionId?; subscriptionId?; invoiceId?; purchasedAt }
interface UsageMeter {
  used(ctx, q: { entityId; purchase: PurchaseRef; after?: Date; at: Date }):
    Promise<{ granted; used; usedAfter; settled?; clawed?; remaining? }>
}
```

`after` is the purchase's `consentedAt` (a subscription: its start request); without it
`usedAfter` must be 0. Deduction = `usedAfter + settled + clawed`; the units taken back
(`WithdrawalEvent.units.returned`) = `remaining ?? granted − used − settled − clawed`.

## Withdrawal, step by step

1. Policy and `mechanisms.withdrawal` required; managed required.
2. Resolve: in-app `purchaseId` (or a contract) of the subject's organization — unknown,
   out of scope or already refunded refuse (`WithdrawalUnavailable`, 409); public: contract
   reference (normalized) or invoice number, and an e-mail of the purchase / profile / paygate
   customer (case-insensitive).
3. Already withdrawn: record the declaration with `duplicateOf`, answer the original receipt.
4. Decide: unmatched or no right → `received`; past the deadline → `expired`; meter and automatic
   refunds → compute (`processing`; a top-up with nothing to reimburse is `performed` in-app,
   `review` in public); else `review`.
5. Append the declaration (status, refund, currency); for `processing`/`review` set `withdrawnAt`
   and `withdrawalId` conditionally — a loser records a `duplicate` event and answers the winner.
6. Record `computed`; mail the receipt (refund / review / expired / unmatched text).
7. Paygate (`processing` only), first attempt under `withdrawal:<id>:<step>`:
   - subscription: `subscriptions.cancel(id, { prorate: false, invoice_now: false, cancellation_details: { comment: 'withdrawal:<id>' } })`, row `withdrawnAt`;
   - invoice-backed: `creditNotes.preview({ invoice, lines: [{ type: 'invoice_line_item', invoice_line_item, amount: net }] })`, `refunds.create({ payment_intent, amount: min(open, preview.total), reason: 'requested_by_customer', metadata: { owlmeans, withdrawalId, purchaseId } })`, `creditNotes.create({ invoice, lines, refund, memo, metadata })` — a failed preview or credit note keeps the plain refund (event recorded);
   - no invoice: the plain refund of the gross amount;
   - no payment intent: `review`.
8. `onWithdrawal` for `refunded` and `review`; a `failed` one is told after reconcile succeeds.

The refund is `oneTimeWithdrawalRefund` (gross on the total, net on the subtotal with the earlier
refunds' net share) or `subscriptionWithdrawalRefund` (components of the net, time from the start
request, units by the meter; gross `ceil(paid × net' / net)`), always capped at what is still
unrefunded and rounded in the consumer's favour.

## Cancellation, step by step

1. Policy and `mechanisms.cancellation`; managed.
2. Resolve the subscription: in-app `subscriptionId`, a contract, else the entitling Stripe
   subscription (none → `CancellationUnavailable('no-subscription')`, ended → `'ended'`); public the
   contract + e-mail, else the only organization whose paygate customer has the e-mail.
3. Decide: extraordinary → `review` (paygate untouched); ordinary and live →
   `cancellationEffectiveAt(periodEnd, interval, requested)` → `already-scheduled` when the period
   end is already scheduled, else `scheduled`; otherwise `received`.
4. Append the declaration; `scheduled`: `subscriptions.update` (`cancel_at_period_end` or
   `cancel_at` + `proration_behavior: 'none'`, `cancellation_details.comment 'cancellation:<id>'`,
   key `cancellation:<id>:schedule`) — a failure answers `received` and is retried.
5. Purchase `cancellationId`/`cancelEffectiveAt`; mail the receipt (effective / review /
   unmatched); `onCancellation`.

## Mails

| Kind | When | Content |
|---|---|---|
| `purchase` | an in-scope purchase with an e-mail, once (the conditional `confirmationMailAt` claim) | order (contract, date, product, total incl. tax), the start request verbatim, withdrawal information with the function's address, model form, links |
| `consent` | a consent covering purchases | the statement verbatim, date/time UTC, the purchases with their last day, the unused-credits rule, links |
| `start` | a start request | the statement verbatim, the plan, the pro-rata rule, links |
| `withdrawal` | every declaration (not a repeat) | the declaration, date/time of receipt, refund / review / expired / unmatched |
| `cancellation` | every declaration | the declaration, the effective date / review / unmatched |

Recipient: the purchase e-mail; the consent's person, else the profile / latest purchase /
paygate customer e-mail; the declaration's e-mail. `ConsumerMailData` carries the records a
renderer needs (`purchase`, `purchases`, `consent`, `declaration`, `links`, `trader`).

## Handlers

Every hook gets the request's context last (`ctx`): reach services through it, keep no module state.

| Option | Default | Use |
|---|---|---|
| `resolveEntity(req, ctx)` | `req.entity?.id` | the organization the account routes act for |
| `subjectOf(req, ctx)` | — | profile id, name and e-mail prefill |
| `guardMoney(req, action, ctx)` | — | `consent`, `start`, `withdraw`, `cancel` — refuse API keys |
| `throttle(req, { action, email, ip }, ctx)` | **required with `public`** | per-IP / per-e-mail / global counters; throw 429 |
| `metaOf(req, ctx)` | `requestOriginOf` | the evidence recorded |
| `publicMinMs` | 1000 | the least time a public declaration answers in |
| `planNameOf(planSku, language, req, ctx)` | — | the plan's short name in a start statement |
| `serviceAlias` | `CONSUMER_RIGHTS_SERVICE` | — |

Bound routes: account `base, profile, purchases, consent, giveConsent, start, requestStart,
withdrawals, withdraw, cancel`; public `base, policy, withdraw, cancel` (the screens are frontend
routes). `checkoutReadEntrypoints`: `base, amountPolicy, planPrices`.
