
import { createContext } from 'react'
import type { EntrypointContextParams } from '../types.js'
import type { Context } from './types.local.js'


export const EntrypointContext = createContext<EntrypointContextParams>({
  alias: '',
  params: {},
  path: '',
  context: {} as Context
})
