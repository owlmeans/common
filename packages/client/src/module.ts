
import { useContext } from 'react'
import { ModuleContext } from './utils/index.js'

export const useModule = () => useContext(ModuleContext)
