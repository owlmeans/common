import type {
  AccessTokenView, CreateAccessToken, IssuedAccessToken
} from '@owlmeans/auth-token'

/**
 * The token surface, as a function of what it is given.
 *
 * The panel performs NO I/O: it renders what it is handed and reports what the user pressed. That
 * is what lets an application mount it against its own transport — a manager facade that proxies
 * the token routes, a mocked list in a harness — without the component knowing. All the I/O lives
 * in {@link UseAccessTokens}.
 */
export interface AccessTokensPanelProps {
  items: AccessTokenView[]
  /**
   * The one moment the plaintext exists in the browser. While it is set the create dialog shows
   * the shown-once step instead of the form; clearing it is `onDismissIssued`.
   */
  issued: IssuedAccessToken | null
  loading?: boolean
  error?: Error | null
  onCreate: (body: CreateAccessToken) => Promise<void>
  onRevoke: (id: string) => Promise<void>
  onDismissIssued: () => void
  /**
   * A line shown beside the freshly issued token telling the reader what to do with it — a curl
   * example, an environment-variable name. Already translated by whoever supplies it, because only
   * the application knows what its own API is called.
   */
  usageHint?: string
}

/** What {@link useAccessTokens} returns — the I/O half of the same surface. */
export interface UseAccessTokens {
  items: AccessTokenView[]
  issued: IssuedAccessToken | null
  loading: boolean
  error: Error | null
  reload: () => Promise<void>
  create: (body: CreateAccessToken) => Promise<void>
  revoke: (id: string) => Promise<void>
  dismissIssued: () => void
}

/**
 * The three entrypoint aliases the hook addresses.
 *
 * `makeAuthTokenEntrypoints` names them from the `authToken` tree by default, which is what the
 * hook falls back to — but an application that mounted the same routes under its own aliases (a
 * manager facade in front of the token service, say) passes its own here.
 */
export interface AccessTokensAliases {
  list: string
  create: string
  revoke: string
}

/** What a row's badge says. Derived per render — see `tokenStatus`. */
export type AccessTokenStatus = 'active' | 'expired' | 'revoked'
