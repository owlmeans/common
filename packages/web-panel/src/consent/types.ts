import type { ResourceRecord } from '@owlmeans/resource'
import type { InitializedService } from '@owlmeans/context'

/** A `single`-store presence flag: one record, no id needed. */
export interface ConsentWidgetPresenceRecord extends ResourceRecord {
  present: boolean
}

export interface ConsentWidgetService extends InitializedService {
  /**
   * Register one mounted cookie-preferences menu row. Returns its release — call it exactly
   * once, on that instance's unmount.
   */
  claim: () => () => void
  /** Whether at least one row is currently mounted anywhere in the app. */
  present: () => boolean
}

export interface ConsentWidgetServiceAppend {
  consentWidget: () => ConsentWidgetService
}
