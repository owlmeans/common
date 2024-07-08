
import { createContext } from 'react'
import type { ModuleContextParams } from '../types.js'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const ModuleContext = createContext<ModuleContextParams>({
  alias: '',
  params: {},
  path: '',
  context: {} as Context
})
