import type { WrappedOIDCService } from '@owlmeans/oidc'
import { WRAPPED_OIDC } from '@owlmeans/oidc'
import type { Context } from '../types.js'

export const wrapper = (context: Context): WrappedOIDCService =>
  context.service(WRAPPED_OIDC)
