import { AUTH_TOKEN_DEFAULT_PREFIX } from '@owlmeans/auth-token'
import type { AuthTokenConfig, AuthTokenContext, AuthTokenGuardOptions } from './types.js'

/** Where the deployment's prefix comes from: the guard's own options, then config, then default. */
export const prefixOf = (context: AuthTokenContext, opts?: AuthTokenGuardOptions): string =>
  opts?.prefix ?? (context.cfg as AuthTokenConfig).authToken?.prefix ?? AUTH_TOKEN_DEFAULT_PREFIX
