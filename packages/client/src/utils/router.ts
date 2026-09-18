import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { AppType } from '@owlmeans/context'
import { makeRouterModel } from '../router.js'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '../types.js'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const buildEntrypointTree = <R, C extends Config = Config, T extends Context<C> = Context<C>>(context: T): EntrypointTree<R> => {
  const entrypoints = context.entrypoints<ClientEntrypoint<R>>().filter(
    module => module.route.route.type === AppType.Frontend
      && (module.sticky || module.route.route.service == null
        || module.route.route.service === context.cfg.service)
  )

  const flatTree = new Map<ClientEntrypoint<R>, ClientEntrypoint<R>[]>()
  const roots: ClientEntrypoint<R>[] = []

  entrypoints.forEach(module => {
    const parentAlias = module.route.route.parent
    if (parentAlias == null) {
      roots.push(module)
    } else {
      const parent = context.entrypoint<ClientEntrypoint<R>>(parentAlias)
      const list = flatTree.get(parent) ?? []
      list.push(module)
      flatTree.set(parent, list)
    }
  })

  const reduceEntrypoints = (entrypoints: ClientEntrypoint<R>[]): EntrypointTree<R> => entrypoints.reduce(
    (tree, module) => tree.set(module, reduceEntrypoints(flatTree.get(module) ?? [])), new Map()
  )

  return reduceEntrypoints(roots)
}

export const visitEntrypointTree = async <T, R>(tree: EntrypointTree<T>, visitor: EntrypointTreeVisitor<T, R>): Promise<R[]> =>
  Array.from(tree.entries()).reduce<Promise<R[]>>(
    async (result, [module, tree], _, source) => [
      ...(await result),
      await visitor(module, await visitEntrypointTree(tree, visitor), source.length === 1)
    ], Promise.resolve([]))

export const initializeRouter = async (context: Context) => {
  if (!context.cfg.ready) {
    await context.configure().init()
    await context.waitForInitialized()
  }
  const model = makeRouterModel()
  return await model.resolve(context)
}

export interface EntrypointTreeVisitor<T, R> {
  (module: ClientEntrypoint<T>, children: R[], alone: boolean): Promise<R>
}

interface EntrypointTree<T> extends Map<ClientEntrypoint<T>, EntrypointTree<T>> {
}
