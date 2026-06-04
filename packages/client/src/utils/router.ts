import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { AppType } from '@owlmeans/context'
import { makeRouterModel } from '../router.js'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '../types.js'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const buildModuleTree = <R, C extends Config = Config, T extends Context<C> = Context<C>>(context: T): ModuleTree<R> => {
  const modules = context.entrypoints<ClientEntrypoint<R>>().filter(
    module => module.route.route.type === AppType.Frontend
      && (module.sticky || module.route.route.service == null
        || module.route.route.service === context.cfg.service)
  )

  const flatTree = new Map<ClientEntrypoint<R>, ClientEntrypoint<R>[]>()
  const roots: ClientEntrypoint<R>[] = []

  modules.forEach(module => {
    const parentAlias = module.getParentAlias()
    if (parentAlias == null) {
      roots.push(module)
    } else {
      const parent = context.entrypoint<ClientEntrypoint<R>>(parentAlias)
      const list = flatTree.get(parent) ?? []
      list.push(module)
      flatTree.set(parent, list)
    }
  })

  const reduceModules = (modules: ClientEntrypoint<R>[]): ModuleTree<R> => modules.reduce(
    (tree, module) => tree.set(module, reduceModules(flatTree.get(module) ?? [])), new Map()
  )

  return reduceModules(roots)
}

export const visitModuleTree = async <T, R>(tree: ModuleTree<T>, visitor: ModuleTreeVisitor<T, R>): Promise<R[]> =>
  Array.from(tree.entries()).reduce<Promise<R[]>>(
    async (result, [module, tree], _, source) => [
      ...(await result),
      await visitor(module, await visitModuleTree(tree, visitor), source.length === 1)
    ], Promise.resolve([]))

export const initializeRouter = async (context: Context) => {
  if (!context.cfg.ready) {
    await context.configure().init()
    await context.waitForInitialized()
  }
  const model = makeRouterModel()
  return await model.resolve(context)
}

export interface ModuleTreeVisitor<T, R> {
  (module: ClientEntrypoint<T>, children: R[], alone: boolean): Promise<R>
}

interface ModuleTree<T> extends Map<ClientEntrypoint<T>, ModuleTree<T>> {
}
