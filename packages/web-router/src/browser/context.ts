import { createContext } from 'react'
import type { RouterState } from './types.js'

export const RouterStateContext = createContext<RouterState | null>(null)

export const OutletContext = createContext<{ depth: number }>({ depth: 0 })
