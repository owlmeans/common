import { createLazyService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { PACKAGE_INSPECTOR_SERVICE } from './consts.js'
import { createPackageInspector } from './inspector.js'
import type { PackageInspector, PackageInspectorOptions, PackageInspectorService } from './types.js'

/**
 * The package inspector host: one inspector per registry id. A LAZY service — it has no async setup,
 * and adapters reach it from an app's `makeContext` while the context is still being set up.
 */
export const createPackageInspectorService = (alias: string = PACKAGE_INSPECTOR_SERVICE): PackageInspectorService => {
  const inspectors = new Map<string, PackageInspector>()

  const register: PackageInspectorService['register'] = inspector => {
    inspectors.delete(inspector.registry)
    inspectors.set(inspector.registry, inspector)
  }

  const get: PackageInspectorService['get'] = registry => {
    if (registry != null && registry !== '') {
      return inspectors.get(registry) ?? null
    }

    return inspectors.size === 1 ? [...inspectors.values()][0] : null
  }

  const list: PackageInspectorService['list'] = () => [...inspectors.values()]

  return createLazyService<PackageInspectorService>(alias, { register, get, list })
}

/** The package inspector host of a context, registered on first use. Idempotent. */
export const ensurePackageInspectorService = (context: BasicContext<any>): PackageInspectorService => {
  if (context.hasService(PACKAGE_INSPECTOR_SERVICE)) {
    return context.service<PackageInspectorService>(PACKAGE_INSPECTOR_SERVICE)
  }
  const service = createPackageInspectorService()
  context.registerService(service)

  return service
}

/**
 * Register an inspector over `options.registry` in the context's host — what a registry adapter's
 * `append*` calls (`appendNpmRegistry` of `@owlmeans/package-registry-npm`). Nothing is registered as
 * a side effect of an import.
 */
export const appendPackageInspector = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, options: PackageInspectorOptions
): T => {
  ensurePackageInspectorService(context).register(createPackageInspector(options))

  return context
}
