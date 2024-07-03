import type { ContextType } from '../types.js'
import type { Module } from '@owlmeans/client-module'
import { AppType } from '@owlmeans/context'
import { makeRouterModel } from '../router.js'

export const buildModuleTree = <T>(context: ContextType): ModuleTree<T> => {
  const modules = context.modules<Module<T>>().filter(
    module => module.route.route.type === AppType.Frontend
      && (module.route.route.service == null
        || module.route.route.service === context.cfg.service)
  )

  const flatTree = new Map<Module<T>, Module<T>[]>()
  const roots: Module<T>[] = []

  modules.forEach(module => {
    const parentAlias = module.getParentAlias()
    if (parentAlias == null) {
      roots.push(module)
    } else {
      const parent = context.module<Module<T>>(parentAlias)
      const list = flatTree.get(parent) ?? []
      list.push(module)
      flatTree.set(parent, list)
    }
  })

  const reduceModules = (modules: Module<T>[]): ModuleTree<T> => modules.reduce(
    (tree, module) => tree.set(module, reduceModules(flatTree.get(module) ?? [])), new Map()
  )

  return reduceModules(roots)
}

export const visitModuleTree = async <T, R>(tree: ModuleTree<T>, visitor: ModuleTreeVisitor<T, R>): Promise<R[]> =>
  Promise.all(Array.from(tree.entries()).map(
    async ([module, tree], _, source) => visitor(module, await visitModuleTree(tree, visitor), source.length === 1)
  ))

export const initializeRouter = async (context: ContextType) => {
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
