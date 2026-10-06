import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { RequestOrigin } from '../../types.js'

/** The request evidence a consumer act is recorded with. */
export interface OriginHelper {
  /**
   * The evidence a consumer act is recorded with. `ip` is `cf-connecting-ip` (a Cloudflare edge
   * sets it and strips a client's own), else the LAST `x-forwarded-for` entry (the one the nearest
   * proxy appended — the first is whatever the client claimed), else `x-real-ip`, else the socket
   * peer. The raw `x-forwarded-for`, the `user-agent` (at most 512 characters), `cf-ipcountry`
   * (the geolocated country — second location evidence for VAT) and `accept-language` are kept as
   * they arrived. The default `metaOf` of the consumer-rights handlers.
   */
  requestOriginOf: (req: AbstractRequest) => RequestOrigin
  /** The origin fields of a record: only those with a value. */
  originFields: (origin: RequestOrigin | undefined) => RequestOrigin
}
