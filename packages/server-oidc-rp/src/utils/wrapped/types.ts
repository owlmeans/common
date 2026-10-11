import type { Auth } from '@owlmeans/auth'
import type { WrappedOIDCService } from '@owlmeans/oidc'

/** A context's wrapped-token seam: the wrapping service and the signer of its bearer value. */
export interface OidcWrappedUtils {
  /** The context's `WRAPPED_OIDC` service. */
  wrapper: () => WrappedOIDCService
  /** Signs `user` with this service's trusted key into the bearer value of a wrapped token. */
  signWrapped: (user: Auth) => Promise<string>
}
