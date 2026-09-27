
import { createContext } from 'react'
import type { EntrypointContextParams, ClientContext } from '../types.js'
import type { ClientConfig } from '@owlmeans/client-context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const EntrypointContext = createContext<EntrypointContextParams>({
  alias: '',
  params: {},
  path: '',
  context: {} as Context
})
