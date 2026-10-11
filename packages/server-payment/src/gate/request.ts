import { AuthForbidden, type Auth, authHelper } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { EntityResolverOption } from '../types.js'
import type { GateEntity, GateRequestScope } from './types.js'

export const makeGateRequestScope = (req: AbstractRequest): GateRequestScope => {
  const defaultEntity = (): string | null =>
    req.entity?.id ?? authHelper.entitySlugOf(req.auth as Auth | undefined) ?? null

  const gateEntityOf = (opts?: EntityResolverOption): GateEntity => {
    if (req.auth == null) {
      throw new AuthForbidden('auth')
    }
    const resolve = opts?.resolveEntity
    const entityId = resolve != null ? resolve(req) : defaultEntity()
    if (entityId == null || entityId === '') {
      throw new AuthForbidden('entity')
    }

    return { auth: req.auth, entityId }
  }

  return { defaultEntity, gateEntityOf }
}
