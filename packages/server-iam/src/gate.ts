import { createLazyService } from '@owlmeans/context'
import type { GateService, AbstractRequest, CommonEntrypoint } from '@owlmeans/entrypoint'
import { authHelper, AuthForbidden, type Auth } from '@owlmeans/auth'
import { OIDC_GATE } from '@owlmeans/oidc'
import { createGateModel, extractPermissionSets, type Config, type Context } from '@owlmeans/server-oidc-rp'
import { hasPermission, gateParamHelper, gateValidationHelper, resolveGateResource, GateResolutionFailure, type GateParamAudit } from '@owlmeans/iam'
import { logger, logThrottle } from '@owlmeans/log'
import type { IamGateOptions } from './types.js'

/**
 * The gate-param grammar lives in `@owlmeans/iam` so the browser, the adapters and code-generation
 * tooling can all read it. Re-exported here because this module was its home and is the documented
 * import path.
 */
export {
  RESOURCE_PARAM_SEPARATOR, RESOURCE_SOURCE_SEPARATOR, RESOURCE_PATH_SEPARATOR,
  GateParamSource, GateParamErrorCode, GateResolutionFailure,
  gateParamHelper, gateValidationHelper, resolveGateResource
} from '@owlmeans/iam'
export type { ParsedGateParam, GateResourceSelector, GateParamAudit, GateParamHelper, GateValidationHelper } from '@owlmeans/iam'

/**
 * Structural faults are logged once per alias+param+reason.
 *
 * A gate on a hot endpoint runs on every request, and a misconfiguration is by definition permanent,
 * so an un-deduplicated log turns one typo into the incident.
 */
const reported = new Set<string>()

const log = logger('server-iam:gate')

/** Aliases whose declarations have already been checked. */
const audited = new Set<string>()

/**
 * IAM gate: claims-first with UMA2 fallback. Registered under the OIDC_GATE alias by
 * appendIam() so target code never knows which IAM backend is active.
 *
 * 1. When the Auth carries a valid PermissionSet[] claim (integrated IAM mode),
 *    params are asserted locally against it — both unscoped and resource-scoped forms, and a set
 *    bound to an organization only for the organization the request acts in.
 * 2. Otherwise (Keycloak mode — its tokens never produce a conforming claim) the
 *    @-suffixes are stripped and the check delegates to the UMA2 gate model from
 *    @owlmeans/server-oidc-rp, byte-equivalent to makeOidcGate.
 *
 * Params are OR'd: holding any one of them admits the request. That is why a malformed or
 * unresolvable param can only contribute `false` and never throw — a sibling that would otherwise
 * have passed must not be refused because of it.
 */
export const makeIamGate = (alias: string = OIDC_GATE, opts?: IamGateOptions): GateService => {
  const reportOnce = (key: string, message: string, data: Record<string, unknown>): void => {
    if (reported.has(key)) {
      return
    }
    reported.add(key)
    log.error(message, data)
  }

  /**
   * A refusal of the gate. Logged once a minute per route, reason and subject — a hot endpoint
   * refuses on every request, and one line per window says the same thing.
   */
  const forbidden = (req: AbstractRequest, reason: string, params: string[]): AuthForbidden => {
    const auth = req.auth as Auth | undefined
    if (logThrottle(`access.forbidden\0${req.alias ?? ''}\0${reason}\0${auth?.userId ?? ''}`, 60_000)) {
      log.warn('Access forbidden', {
        alias: req.alias, reason, params, userId: auth?.userId, entitySlug: req.entity?.slug ?? (auth != null ? authHelper.entitySlugOf(auth) : undefined),
      }, { event: 'access.forbidden' })
    }
    return new AuthForbidden(reason)
  }

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

      let routePath: string | undefined
      try {
        routePath = entrypoint.mount()
      } catch {
        // The mount needs a service with an address; an entrypoint that has none still has a filter
        // worth auditing.
      }

      const audit: GateParamAudit = {
        ...(routePath != null ? { routePath } : {}),
        ...(entrypoint.filter != null ? { filter: entrypoint.filter as GateParamAudit['filter'] } : {})
      }

      for (const issue of gateValidationHelper.validateGateParams(params, audit)) {
        log.error('Gate param is misconfigured', {
          param: issue.param, alias: req.alias, code: issue.code, detail: issue.detail,
        })
      }
    } catch {
      // An entrypoint that cannot be looked up is not this gate's problem to report.
    }
  }

  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>()

      if (req.auth == null) {
        throw forbidden(req, 'auth', params)
      }

      const auth = req.auth as Auth
      const sets = extractPermissionSets(auth.permissions)

      if (sets != null) {
        auditEntrypoint(ctx, req, params)

        // Why a param failed, kept aside so a denial can say whether the gate was misconfigured or
        // the subject simply lacks the grant. The two look identical from the outside and are
        // repaired in completely different places.
        const structural: string[] = []

        // The organization the request acts in. A relying party of a tenanted client attaches it
        // through the guard; otherwise it is the token's. A set bound to any other organization
        // never satisfies the check.
        const entitySlug = req.entity?.slug ?? authHelper.entitySlugOf(auth)

        const granted = params.some(param => {
          const { permission, resource, error } = gateParamHelper.parseGateParam(param)
          // Grants are stored against the entity's stable id wherever one is resolvable; the
          // slug is only a fallback for deployments with no organization store of their own,
          // where the slug IS the identifier.
          const fixed = permission.replaceAll('{entity}', req.entity?.id ?? authHelper.entitySlugOf(auth) ?? '-')

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

            return hasPermission(auth, fixed, { resourceId: resolution.id, entitySlug })
          }

          return hasPermission(auth, fixed, { entitySlug })
        })

        if (!granted) {
          structural.forEach(detail => reportOnce(
            `${req.alias}\0${detail}`,
            'Gate refused a request it could not evaluate', { alias: req.alias, detail }
          ))

          throw forbidden(req, 'permission', params)
        }

        return
      }

      // UMA2 fallback. Resource scoping is NOT enforced here: a Keycloak-backed deployment cannot
      // store a resource-scoped grant, so a scoped param widens to a project-wide check and the same
      // declaration means two different things depending on which backend is active.
      const scoped = params.filter(param => gateParamHelper.parseGateParam(param).resource != null)
      scoped.forEach(param => reportOnce(
        `uma2\0${req.alias}\0${param}`,
        'Gate param is resource-scoped, but resource scoping is not enforced in UMA2 mode — it is checked as a '
        + 'project-wide permission', { param, alias: req.alias }
      ))

      const usable = opts?.strictResourceScope === true
        ? params.filter(param => gateParamHelper.parseGateParam(param).resource == null)
        : params

      if (usable.length < 1) {
        throw forbidden(req, 'permission', params)
      }

      const stripped = usable.map(param => gateParamHelper.parseGateParam(param).permission)
      const model = createGateModel(ctx)
      const permissions = await model.loadPermissions(auth, stripped)

      if (permissions.length < 1) {
        throw forbidden(req, 'permission', params)
      }
    }
  })

  return service
}
