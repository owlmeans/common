import type { PaygateBootstrapOptions } from '../types.js'
import type { Paygate } from '../paygate/types.js'

/** What brings every registered paygate to a deployment's declaration. */
export interface PaygateBootstrapHelper {
  /**
   * Bring every registered paygate to what this deployment declares (`bootstrapPaygate`, in
   * registration order).
   *
   * The webhook URL and the owner key come from the context's gateway (`webhookService`, `owner`), so
   * every process of one deployment — the one bootstrapping at boot, a `resync`, an application's
   * forced maintenance run — computes the same URL and rows; each step is fingerprinted, so running it
   * from any of them is idempotent.
   */
  bootstrap: (opts?: PaygateBootstrapOptions) => Promise<void>
  /**
   * One paygate, each step on its own so one failing does not block the others: products and prices
   * (`catalogue`), the customer-portal configuration (`portal`), the webhook endpoint (`webhook`) — a
   * capability the paygate lacks is skipped.
   */
  bootstrapPaygate: (paygate: Paygate, opts?: PaygateBootstrapOptions) => Promise<void>
}
