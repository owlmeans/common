import type { ConnectConfirmation } from '@owlmeans/viable-common'
import type { RefusalPhrase } from '../types.js'

/** What a parent agent is told when the platform refuses it — one actionable sentence per refusal. */
export interface RefusalHelper {
  /**
   * What the model tells a PERSON when a paid action waits for the EU spend consent. Only a person
   * can give that express request, in the browser, so the sentence names the page and says outright
   * that retrying first is pointless: a model that retries on its own gets the same refusal.
   */
  consentRequiredPhrase: (url: string, deadline?: Date) => string
  /**
   * What the model tells a PERSON when a conversion verb waits for their agreement — what the plan's
   * conversion limit covers and has left, what the stage is estimated at and where that comes from
   * (credit limits as credits, topped-up credits as money) — and the exact call that gives it.
   * Unlike the consent, this is agreed to in the conversation; the sentence still forbids the model
   * from sending `confirm: true` on its own, because the call it unlocks spends the user's money.
   *
   * `retry` is the call to repeat (the caller knows the project and the arguments); without it, the
   * same tool with the same arguments and `confirm: true`.
   */
  confirmationRequiredPhrase: (fields: ConnectConfirmation, retry?: string) => string
  /**
   * A bare 428 answered to a conversion verb sent WITHOUT `confirm` — what a production body leaves
   * of a refusal (an incident id and the status). It is the confirmation unless the organization's
   * spend consent is also missing, and the two cannot be told apart here, so both are said, in the
   * order they are met: the confirmation, then — only if the confirmed call is refused again — the
   * consent in the browser.
   */
  unconfirmedConversionPhrase: (retry: string) => string
  /**
   * The three refusals only a PERSON can resolve — the balance, the EU spend consent and a
   * conversion's confirmation — in the words the model relays to them, or `null` for anything else.
   * Matched by class: their fields travel packed in the message and are rebuilt by
   * `finalizeUnmarshal()`. `retry` is the confirmation's call to repeat, where the caller knows it.
   */
  personRefusalPhrase: (e: unknown, retry?: string) => string | null
  /**
   * What a refusal SAYS, with the marshalling and the stack taken off it.
   *
   * A marshalled error is `type|||message|||stack`, so the middle segment is the marker and the last
   * one is a stack trace from a machine the reader has no access to. What is left is the marker
   * alone — which is the fallback whenever nothing in {@link RefusalHelper.refusals} recognises it, because a
   * marker names the refusal even when no sentence has been written for it yet.
   *
   * Text that was never marshalled is returned exactly as it is. A stack only ever arrives inside
   * the marshalling, and the same field carries things that are not refusals at all — a run's
   * `error` doubles as the build warning a slot recorded, and cutting that at the first line that
   * looks like a stack frame would throw away the diagnostics somebody asked for.
   */
  refusalMessage: (e: unknown) => string
  /**
   * The one sentence a parent agent is given for anything that refused it.
   *
   * The reader is a language model holding a tool result, and it acts on what it reads: a marshalled
   * type name followed by a stack trace tells it only that something went wrong somewhere, so it
   * retries a call that can never succeed, or reports the server as broken. A refusal is an ANSWER —
   * this origin is the project, that decision is not available here, the balance will not cover it —
   * and every one of them has something the parent should do next.
   *
   * An unknown marker keeps that property rather than dropping it: the marker stays, because it is
   * the honest answer as the platform grows refusals faster than phrasings, and {@link
   * UNPHRASED_REFUSAL} names the tool to call — a parent left holding wire text alone has neither.
   */
  refusalPhrase: (e: unknown) => string
  /**
   * Every refusal a connector can be handed, and the one sentence it is handed instead.
   *
   * Ordered by SPECIFICITY, because the first marker the message contains wins: every reason of a
   * family sits above the family's own marker, or the family would answer for all of them. A marker
   * that is a substring of a later one is a marker that shadows it, which `catalogue.spec.ts` pins
   * rather than leaves to review.
   *
   * The markers are literals here on purpose. They are wire text owned by packages this one does not
   * depend on, and copying the constant would need a dependency edge from a tooling package onto the
   * platform's own — so they are spelled once, in the order the platform spells them, and are
   * exactly the substrings the manager's own phrasing matches on. Anything unmatched falls back to
   * its marker, which is the one outcome that stays honest as the platform grows a refusal this
   * table has never heard of.
   */
  refusals: RefusalPhrase[]
}
