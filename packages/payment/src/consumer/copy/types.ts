import type { ConsentKind } from '../../consts.js'
import type { ProductPlan } from '../../types.js'
import type { ConsentStatement, CopyTree, CopyValues, LegalLabels } from '../types.js'

/** The consumer-rights legal copy of any language, and the texts rendered from it. */
export interface ConsumerCopyHelper {
  /**
   * The consumer-rights copy of one language — the `payment-consumer-rights` bundles as registered
   * (the package's own, merged under any application override made with
   * `addI18nApp(lng, 'payment-consumer-rights', data, { ns: LIB_NAMESPACE })`), key by key over the
   * English ones so a missing key still reads. Any language, independent of the active i18next
   * language and without draining a bundle: this is what a server renders e-mails and paygate
   * texts from, and what a dialog shows in the billing country's language.
   */
  consumerRightsCopy: (lng: string) => CopyTree
  /**
   * One text of the copy at a dot path (`withdrawal.function`), its `{{name}}` placeholders filled.
   * Values are inserted as given — escape them for the medium (HTML) before passing them in.
   *
   * With a `context`, the variant `<path>_<context>` is read first and the base `path` only where the
   * copy has no such variant — the i18next context suffix (`performance-consent.request_included`).
   *
   * @throws ConsumerRightsError `copy:<path>` when the path is not a text, `copy:<path>:<name>` when a
   * placeholder has no value — a legal text is never sent with a hole in it.
   */
  consumerText: (lng: string, path: string, vars?: CopyValues, context?: string) => string
  /** The placeholders a text of the copy expects, in order of first appearance. */
  placeholdersOf: (text: string) => string[]
  /**
   * The statutory button labels of one language — the withdrawal function (CRD Art. 11a; § 356a
   * BGB; L221-21) and the cancellation function (§ 312k BGB; L215-1-1). Shown in the language of the
   * billing country, whatever the interface language.
   */
  legalLabelsOf: (lng: string) => LegalLabels
  /**
   * The copy variant of a plan's subscription start statement — the one place it is decided.
   *
   * `'units'` exactly when the plan's `withdrawal.components` declare a `units` part: the statement
   * then names the split (the services pro rata by time, the right of withdrawal expiring for the
   * included units used) — the `_units` texts. Otherwise (no components, or `time` parts only: the
   * whole price pro rata by the days elapsed) `undefined`, the base texts.
   */
  startContextOf: (plan: Pick<ProductPlan, 'withdrawal'> | null | undefined) => 'units' | undefined
  /**
   * The express request of one consent kind in one language, rendered — what the dialog shows, the
   * server records and the confirmation e-mail repeats verbatim. `trader` names the business;
   * `plan` (the plan's title) is required for a subscription start; `context` picks the
   * `_<context>` variant of each text that has one — the policy's `consentContext` for the
   * performance consent, `startContextOf(plan)` for a subscription start.
   */
  consentStatementOf: (
    lng: string, kind: ConsentKind, vars: { trader: string, plan?: string, context?: string },
  ) => ConsentStatement
}
