// import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { DEFAULT_ROOT } from './consts.js'
import type { AppConfig, AppContext, RenderOptions } from './types.js'
import { WebApp } from './components/index.js'
import { provide } from './router.js'

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

export const renderApp = <C extends AppConfig, T extends AppContext<C>>(context: T, opts?: RenderOptions) =>
  render(<WebApp context={context} provide={provide} />, opts)
