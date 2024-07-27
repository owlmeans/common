import type { DIDServiceDeps } from './types.js'

export const DEFAULT_ALIAS = 'did-wallet'

export const DEF_KEYS_RESOURCE = `${DEFAULT_ALIAS}-keys`
export const DEF_META_RESOURCE = `${DEFAULT_ALIAS}-meta`
export const DEF_MASTER_RESOURCE = `${DEFAULT_ALIAS}-master`

export const defDeps: DIDServiceDeps = {
  keys: DEF_KEYS_RESOURCE,
  meta: DEF_META_RESOURCE,
  master: DEF_MASTER_RESOURCE
}
