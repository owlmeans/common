
import { createContext } from 'react'
import type { ModuleContextParams, ClientContext } from '../types.js'
import type { ClientConfig } from '@owlmeans/client-context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const ModuleContext = createContext<ModuleContextParams>({
  alias: '',
  params: {},
  path: '',
  context: {} as Context
})
