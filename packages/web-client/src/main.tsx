// import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { DEFAULT_ROOT } from './consts.js'
import type { AppConfig, AppContext, RenderOptions } from './types.js'
import { WebApp } from './components/index.js'

export const render = (node: ReactNode, opts?: RenderOptions) => {
  const _callback = () => {
    const key = opts?.domId ?? DEFAULT_ROOT
    const root = document.getElementById(key)
    if (opts?.debug) {
      console.debug(`Render react app to ${key}`)
    }
    if (root == null) {
      throw new Error(`Root element not found with id: ${key}`)
    }
    if (opts?.hydrate === true) {
      hydrateRoot(root, node)
    } else {
      createRoot(root).render(node)
    }
  }

  opts?.onReady ?? true ? window.addEventListener('DOMContentLoaded', _callback) : _callback()
}

/**
 * Mount the application.
 *
 * `children` are rendered inside the context provider and BEFORE the router, which makes them the
 * app's global overlay slot: a consent dialog, a toast surface, anything that must exist on every
 * route and outlive navigation. A component mounted inside a route instead is torn down and
 * rebuilt on every navigation, which for a dialog means it closes itself.
 */
export const renderApp = <C extends AppConfig, T extends AppContext<C>>(
  context: T, opts?: RenderOptions, children?: ReactNode
) => render(<WebApp context={context}>{children}</WebApp>, opts)
