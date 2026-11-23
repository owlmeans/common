import { useEffect } from 'react'
import type { FC, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { RouteObject } from '@owlmeans/router'
import { makeBrowserRouterPlugin } from '@owlmeans/web-router'
import { createModalService, handler, useToggle } from '../../../src/index.js'
import type { EntrypointContextParams, ModalBodyProps } from '../../../src/index.js'
import { createRouteRenderer } from '../../../src/utils/route.js'
import type { RendererParams } from '../../../src/utils/types.js'

/*
 * A real route tree rendered by `createRouteRenderer` behind the OwlMeans browser router: a
 * layout carrying the modal host, an index screen that opens a `ctx.modal()`-style dialog, and
 * a parameterized item screen. Every route's `handle` is the one `handler()` builds, exactly as
 * an entrypoint bound with a renderer gets it. Mounts are counted in `window.__route`.
 */

interface RouteProbe {
  mounts: Record<'layout' | 'host' | 'screen' | 'item', number>
  results: unknown[]
  stack: () => number
}

const plugin = makeBrowserRouterPlugin()
const modal = createModalService()

const probe: RouteProbe = {
  mounts: { layout: 0, host: 0, screen: 0, item: 0 },
  results: [],
  stack: () => modal.stack.length,
}
;(window as unknown as { __route: RouteProbe }).__route = probe

// Only what the route renderer reads: the router plugin; no screen here is guarded.
const context = { router: () => plugin } as unknown as RendererParams['context']

const entrypoint = (alias: string, Component: FC<any>): RendererParams['module'] => {
  const module: Record<string, unknown> = { alias, path: () => `/${alias}`, getGuards: () => [], ctx: context }
  module.handle = handler(Component)({ ref: module as never })

  return module as unknown as RendererParams['module']
}

const Dialog: FC<ModalBodyProps> = ({ modal }) =>
  <div id="dialog"><button id="dialog-cancel" onClick={() => modal?.cancel()}>cancel</button></div>

const ModalHost: FC = () => {
  const toggle = useToggle(false)
  useEffect(() => {
    probe.mounts.host++
    modal.link(toggle)
  }, [])

  const Com = toggle.opened ? modal.layer()?.Com : undefined

  return <div id="modal-host">{Com != null ? <Com modal={modal} /> : null}</div>
}

const Nav: FC = () => {
  const navigate = plugin.useNavigate()
  const [, setSearch] = plugin.useSearchParams()
  // The way a screen keeps a tab in the URL: replace the query, keep the path.
  const tab = (value: string) => setSearch(current => {
    const params = new URLSearchParams(current)
    params.set('tab', value)
    return params
  }, { replace: true })

  return <nav>
    <button id="nav-tab-a" onClick={() => tab('a')}>tab a</button>
    <button id="nav-tab-b" onClick={() => tab('b')}>tab b</button>
    <button id="nav-home" onClick={() => navigate('/route/')}>home</button>
    <button id="nav-item-1" onClick={() => navigate('/route/item/1')}>item 1</button>
    <button id="nav-item-2" onClick={() => navigate('/route/item/2')}>item 2</button>
  </nav>
}

const Layout: FC<{ children?: ReactNode }> = ({ children }) => {
  useEffect(() => { probe.mounts.layout++ }, [])

  return <div id="layout"><Nav />{children}<ModalHost /></div>
}

const Screen: FC = () => {
  useEffect(() => { probe.mounts.screen++ }, [])
  const [search] = plugin.useSearchParams()
  const open = () => { void modal.request(Dialog).then(result => { probe.results.push(result) }) }

  return <div id="screen" data-tab={search.get('tab') ?? ''}>
    <button id="open-modal" onClick={open}>open</button>
  </div>
}

const Item: FC<EntrypointContextParams> = ({ params }) => {
  useEffect(() => { probe.mounts.item++ }, [])

  const id = String((params as Record<string, unknown>).id ?? '')

  return <div id="item" data-id={id}>item {id}</div>
}

const routes: RouteObject[] = [{
  path: 'route',
  Component: createRouteRenderer({ context, module: entrypoint('layout', Layout), hasChildren: true }),
  children: [
    { index: true, Component: createRouteRenderer({ context, module: entrypoint('screen', Screen), hasChildren: false }) },
    { path: 'item/:id', Component: createRouteRenderer({ context, module: entrypoint('item', Item), hasChildren: false }) },
  ],
} as RouteObject]

const Provider = plugin.provider()
const router = plugin.compile(routes)

createRoot(document.getElementById('root')!).render(<Provider router={router} />)
