import type { Module } from '@owlmeans/client-module'
import { AppType } from '@owlmeans/context'
import { makeRouterModel } from '../router.js'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const buildModuleTree = <R, C extends Config = Config, T extends Context<C> = Context<C>>(context: T): ModuleTree<R> => {
  const modules = context.modules<Module<R>>().filter(
    module => module.route.route.type === AppType.Frontend
      && (module.sticky || module.route.route.service == null
        || module.route.route.service === context.cfg.service)
  )

  const flatTree = new Map<Module<R>, Module<R>[]>()
  const roots: Module<R>[] = []

  modules.forEach(module => {
    const parentAlias = module.getParentAlias()
    if (parentAlias == null) {
      roots.push(module)
    } else {
      const parent = context.module<Module<R>>(parentAlias)
      const list = flatTree.get(parent) ?? []
      list.push(module)
      flatTree.set(parent, list)
    }
  })

  const reduceModules = (modules: Module<R>[]): ModuleTree<R> => modules.reduce(
    (tree, module) => tree.set(module, reduceModules(flatTree.get(module) ?? [])), new Map()
  )

  return reduceModules(roots)
}

export const visitModuleTree = async <T, R>(tree: ModuleTree<T>, visitor: ModuleTreeVisitor<T, R>): Promise<R[]> =>
  Promise.all(Array.from(tree.entries()).map(
    async ([module, tree], _, source) => visitor(module, await visitModuleTree(tree, visitor), source.length === 1)
  ))

export const initializeRouter = async (context: Context) => {
  if (!context.cfg.ready) {
    await context.configure().init().waitForInitialized()
  }
  const model = makeRouterModel()
  return await model.resolve(context)
}

export interface ModuleTreeVisitor<T, R> {
  (module: Module<T>, children: R[], alone: boolean): Promise<R>
}

interface ModuleTree<T> extends Map<Module<T>, ModuleTree<T>> {
}
