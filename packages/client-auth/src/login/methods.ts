import type { LoginMethodConfig, LoginScreenConfig } from '@owlmeans/config'
import { DEFAULT_METHOD_ORDER } from './consts.js'
import type { LoginMethod, LoginMethodContext, LoginMethodSource } from './types.js'

/**
 * The module-global registry of method SOURCES.
 *
 * A source, rather than a method, because the two things that offer sign-in methods answer
 * different questions at different times: the plugin registry knows what code is loaded, and the
 * OIDC configuration knows what an entity is federated with. Both are answered per render — a
 * provider list can arrive from the api-config middleware after the first paint.
 *
 * Global, like the `AuthenticationPlugin` map it mirrors, because a package registers its source
 * from a side-effect import that has no context to hang it on. A context-scoped registry exists
 * alongside it on the login service, and both are merged by {@link resolveLoginMethods}.
 */
const sources: LoginMethodSource[] = []

export const registerMethodSource = (source: LoginMethodSource): void => {
  const existing = sources.findIndex(candidate => candidate.alias === source.alias)
  if (existing >= 0) {
    sources.splice(existing, 1)
  }
  sources.push(source)
}

export const listMethodSources = (): LoginMethodSource[] => [...sources]

/** Normalize a config entry, which may be a bare id or a full override object. */
const asConfig = (entry: string | LoginMethodConfig): LoginMethodConfig =>
  typeof entry === 'string' ? { id: entry } : entry

const merge = (method: LoginMethod, override: LoginMethodConfig | undefined): LoginMethod =>
  override == null ? method : {
    ...method,
    ...(override.label != null ? { label: override.label } : {}),
    ...(override.i18nKey != null ? { i18nKey: override.i18nKey } : {}),
    ...(override.icon != null ? { icon: override.icon } : {}),
    ...(override.order != null ? { order: override.order } : {}),
    ...(override.emphasis != null ? { emphasis: override.emphasis } : {}),
    ...(override.params != null ? { params: { ...method.params, ...override.params } } : {}),
  }

/**
 * Everything the current environment may be offered, in the order it should be offered in.
 *
 * Resolution order matters and is not arbitrary:
 *
 * 1. Sources produce candidates. A source that throws is skipped rather than taking the screen
 *    down — a misconfigured provider list must not remove the sign-in method that does work.
 * 2. `restricted` candidates are dropped unless the configuration named them, which is what makes
 *    an operator login opt-in rather than merely unadvertised.
 * 3. An explicit `methods` list is both a filter AND the order, because an app that bothered to
 *    list them means that list.
 */
export const resolveLoginMethods = (
  ctx: LoginMethodContext, cfg?: LoginScreenConfig, extra: LoginMethodSource[] = []
): LoginMethod[] => {
  const candidates: LoginMethod[] = []
  for (const source of [...sources, ...extra]) {
    try {
      candidates.push(...source.list(ctx))
    } catch (e) {
      console.error(`login: method source "${source.alias}" failed`, e)
    }
  }

  const overrides = cfg?.overrides ?? {}
  const listed = cfg?.methods?.map(asConfig)
  const listedIds = listed?.map(entry => entry.id).filter((id): id is string => id != null)

  const offered = candidates
    .filter(method => {
      const override = overrides[method.id] ?? listed?.find(entry => entry.id === method.id)
      if (override?.enabled === false || override?.hidden === true) {
        return false
      }
      // A restricted method is offered only where the configuration asked for it — by naming it in
      // `methods`, or by enabling it in `overrides`. Registering the plugin is deliberately not
      // enough: an operator login that appears wherever its code happens to be bundled is an
      // operator login in production.
      if (method.restricted === true
        && listedIds?.includes(method.id) !== true
        && override?.enabled !== true) {
        return false
      }
      return true
    })
    .map(method => merge(method, overrides[method.id]))

  if (listedIds != null) {
    return listedIds
      .map(id => {
        const method = offered.find(candidate => candidate.id === id)
        return method != null ? merge(method, listed?.find(entry => entry.id === id)) : null
      })
      .filter((method): method is LoginMethod => method != null)
  }

  return offered.sort((a, b) => {
    const order = (a.order ?? DEFAULT_METHOD_ORDER) - (b.order ?? DEFAULT_METHOD_ORDER)
    return order !== 0 ? order : a.id.localeCompare(b.id)
  })
}

/**
 * The method a screen highlights and focuses.
 *
 * The first `primary` one, else the first offered. It is highlighted, never started: requirement
 * one of this whole feature is that nothing leaves the document without a click.
 */
export const primaryLoginMethod = (methods: LoginMethod[]): LoginMethod | null =>
  methods.find(method => method.emphasis === 'primary') ?? methods[0] ?? null
