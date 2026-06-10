import { createLazyService } from '@owlmeans/context'
import type { GateService, AbstractRequest } from '@owlmeans/entrypoint'
import { OIDC_GATE } from '@owlmeans/oidc'
import { AuthForbidden } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { createGateModel, extractPermissionSets } from '@owlmeans/server-oidc-rp'
import type { Config, Context } from '@owlmeans/server-oidc-rp'
import { hasPermission } from '@owlmeans/iam'

/**
 * Gate-param syntax:
 *   <permission>                — unscoped (project-wide) check, e.g. 'article--modify'
 *   <permission>@<requestParam> — resource-scoped: the resource id is resolved from
 *                                 req.params[requestParam] ?? req.query[requestParam]
 *                                 and must be listed in the grant's resources[]
 * '{entity}' substitution applies to the permission part in both forms.
 */
export const RESOURCE_PARAM_SEPARATOR = '@'

export interface ParsedGateParam {
  permission: string
  resourceParam?: string
}

export const parseGateParam = (param: string): ParsedGateParam => {
  const idx = param.indexOf(RESOURCE_PARAM_SEPARATOR)
  if (idx < 0) {
    return { permission: param }
  }

  return { permission: param.slice(0, idx), resourceParam: param.slice(idx + 1) }
}

const resolveResourceId = (req: AbstractRequest, resourceParam: string): string | undefined => {
  const params = req.params as Record<string, unknown> | undefined
  const query = req.query as Record<string, unknown> | undefined
  const value = params?.[resourceParam] ?? query?.[resourceParam]

  return value != null ? `${value}` : undefined
}

/**
 * IAM gate: claims-first with UMA2 fallback. Registered under the OIDC_GATE alias by
 * appendIam() so target code never knows which IAM backend is active.
 *
 * 1. When the Auth carries a valid PermissionSet[] claim (integrated IAM mode),
 *    params are asserted locally against it — both unscoped and resource-scoped forms.
 * 2. Otherwise (Keycloak mode — its tokens never produce a conforming claim) the
 *    @-suffixes are stripped and the check delegates to the UMA2 gate model from
 *    @owlmeans/server-oidc-rp, byte-equivalent to makeOidcGate.
 */
export const makeIamGate = (alias: string = OIDC_GATE): GateService => {
  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>()

      if (req.auth == null) {
        throw new AuthForbidden('auth')
      }

      const auth = req.auth as Auth
      const sets = extractPermissionSets(auth.permissions)

      if (sets != null) {
        const granted = params.some(param => {
          const { permission, resourceParam } = parseGateParam(param)
          const fixed = permission.replaceAll('{entity}', auth.entityId ?? '-')

          if (resourceParam != null) {
            const resourceId = resolveResourceId(req, resourceParam)
            if (resourceId == null) {
              return false
            }

            return hasPermission(auth, fixed, { resourceId })
          }

          return hasPermission(auth, fixed)
        })

        if (!granted) {
          throw new AuthForbidden('permission')
        }

        return
      }

      const stripped = params.map(param => parseGateParam(param).permission)
      const model = createGateModel(ctx)
      const permissions = await model.loadPermissions(auth, stripped)

      if (permissions.length < 1) {
        throw new AuthForbidden('permission')
      }
    }
  })

  return service
}
