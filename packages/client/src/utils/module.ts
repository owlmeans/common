
import { createContext } from 'react'
import type { ContextType, ModuleContextParams } from '../types.js'

export const ModuleContext = createContext<ModuleContextParams>({
  alias: '',
  params: {},
  path: '',
  context: {} as ContextType
})
