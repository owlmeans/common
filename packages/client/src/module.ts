
import { useContext } from 'react'
import { ModuleContext } from './utils/index.js'
import type { ModuleContextParams } from './types.js'

export const useModule = <T extends {} = {}>() => useContext(ModuleContext) as ModuleContextParams<T>
