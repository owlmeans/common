import { createLazyService } from '@owlmeans/context'
import type { GateService, AbstractRequest, CommonEntrypoint } from '@owlmeans/entrypoint'
import { entitySlugOf } from '@owlmeans/auth'
import { OIDC_GATE } from '@owlmeans/oidc'
import { AuthForbidden } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { createGateModel, extractPermissionSets } from '@owlmeans/server-oidc-rp'
import type { Config, Context } from '@owlmeans/server-oidc-rp'
import {
  hasPermission, parseGateParam, resolveGateResource, validateGateParams, GateResolutionFailure
} from '@owlmeans/iam'
import type { GateParamAudit } from '@owlmeans/iam'

/**
 * The gate-param grammar lives in `@owlmeans/iam` so the browser, the adapters and code-generation
 * tooling can all read it. Re-exported here because this module was its home and is the documented
 * import path.
 */
export {
  RESOURCE_PARAM_SEPARATOR, RESOURCE_SOURCE_SEPARATOR, RESOURCE_PATH_SEPARATOR,
  GateParamSource, GateParamErrorCode, GateResolutionFailure,
  parseGateParam, parseGateSelector, formatGateParam, resolveGateResource, validateGateParams
} from '@owlmeans/iam'
export type { ParsedGateParam, GateResourceSelector, GateParamAudit } from '@owlmeans/iam'

export interface IamGateOptions {
  /**
   * Refuse a resource-scoped param on the UMA2 fallback path instead of widening it to a
   * project-wide check.
   *
   * Off by default, and deliberately so. A Keycloak-backed deployment cannot hold a resource-scoped
   * grant at all — the adapter throws `IamUnsupported('resource-scoped-grant')` — so denying would
   * lock every user out of every scoped endpoint rather than tightening anything. Turn it on only
   * where the resulting refusals are the intended outcome.
   */
  strictResourceScope?: boolean
}

/**
 * Structural faults are logged once per alias+param+reason.
 *
 * A gate on a hot endpoint runs on every request, and a misconfiguration is by definition permanent,
 * so an un-deduplicated log turns one typo into the incident.
 */
const reported = new Set<string>()

const reportOnce = (key: string, message: string): void => {
  if (reported.has(key)) {
    return
  }
  reported.add(key)
  console.error(message)
}

/** Aliases whose declarations have already been checked. */
const audited = new Set<string>()

/**
 * Check an entrypoint's gate params against what it declares, once, the first time it is reached.
 *
 * Structurally unable to affect the outcome: it only ever logs. A selector naming a key the
 * entrypoint's filter does not declare is stripped by validation before the gate runs, so the
 * endpoint denies every request with a clean build and nothing else to go on — this is the line that
 * says why.
 */
const auditEntrypoint = (ctx: Context, req: AbstractRequest, params: string[]): void => {
  if (req.alias == null || audited.has(req.alias)) {
    return
  }
  audited.add(req.alias)

  try {
    const entrypoint = ctx.entrypoint<CommonEntrypoint>(req.alias)
    if (entrypoint == null) {
      return
    }

    const audit: GateParamAudit = {
      ...(typeof (entrypoint as any).getPath === 'function'
        ? { routePath: (entrypoint as any).getPath() as string }
        : {}),
      ...(entrypoint.filter != null ? { filter: entrypoint.filter as GateParamAudit['filter'] } : {})
    }

    for (const issue of validateGateParams(params, audit)) {
      console.error(
        `Gate param "${issue.param}" on entrypoint "${req.alias}" is misconfigured`
        + ` [${issue.code}]: ${issue.detail}`
      )
    }
  } catch {
    // An entrypoint that cannot be resolved is not this gate's problem to report.
  }
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
 *
 * Params are OR'd: holding any one of them admits the request. That is why a malformed or
 * unresolvable param can only contribute `false` and never throw — a sibling that would otherwise
 * have passed must not be refused because of it.
 */
export const makeIamGate = (alias: string = OIDC_GATE, opts?: IamGateOptions): GateService => {
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
        auditEntrypoint(ctx, req, params)

        // Why a param failed, kept aside so a denial can say whether the gate was misconfigured or
        // the subject simply lacks the grant. The two look identical from the outside and are
        // repaired in completely different places.
        const structural: string[] = []

        const granted = params.some(param => {
          const { permission, resource, error } = parseGateParam(param)
          // Grants are stored against the entity's stable id wherever one is resolvable; the
          // slug is only a fallback for deployments with no organization store of their own,
          // where the slug IS the identifier.
          const fixed = permission.replaceAll('{entity}', req.entity?.id ?? entitySlugOf(auth) ?? '-')

          if (error != null) {
            structural.push(`"${param}" does not parse [${error.code}]: ${error.detail}`)
            return false
          }

          if (resource != null) {
            const resolution = resolveGateResource(req, resource)
            if (resolution.id == null) {
              if (resolution.reason !== GateResolutionFailure.NotProvided) {
                structural.push(
                  `"${param}" resolved no resource id [${resolution.reason}]`
                  + ` from ${resource.sources.join(', ')}`
                )
              }
              return false
            }

            return hasPermission(auth, fixed, { resourceId: resolution.id })
          }

          return hasPermission(auth, fixed)
        })

        if (!granted) {
          structural.forEach(detail => reportOnce(
            `${req.alias}\0${detail}`,
            `Gate on entrypoint "${req.alias}" refused a request it could not evaluate: ${detail}`
          ))

          throw new AuthForbidden('permission')
        }

        return
      }

      // UMA2 fallback. Resource scoping is NOT enforced here: a Keycloak-backed deployment cannot
      // store a resource-scoped grant, so a scoped param widens to a project-wide check and the same
      // declaration means two different things depending on which backend is active.
      const scoped = params.filter(param => parseGateParam(param).resource != null)
      scoped.forEach(param => reportOnce(
        `uma2\0${req.alias}\0${param}`,
        `Gate param "${param}" on entrypoint "${req.alias}" is resource-scoped, but resource scoping`
        + ' is not enforced in UMA2 mode — it is checked as a project-wide permission'
      ))

      const usable = opts?.strictResourceScope === true
        ? params.filter(param => parseGateParam(param).resource == null)
        : params

      if (usable.length < 1) {
        throw new AuthForbidden('permission')
      }

      const stripped = usable.map(param => parseGateParam(param).permission)
      const model = createGateModel(ctx)
      const permissions = await model.loadPermissions(auth, stripped)

      if (permissions.length < 1) {
        throw new AuthForbidden('permission')
      }
    }
  })

  return service
}
