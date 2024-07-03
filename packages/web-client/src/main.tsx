// import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_ROOT } from './consts.js'
import type { RenderOptions } from './types.js'

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
    // createRoot(root).render(<StrictMode>{node}</StrictMode>)
    createRoot(root).render(node)
  }

  opts?.onReady ?? true ? window.addEventListener('DOMContentLoaded', _callback) : _callback()
}
