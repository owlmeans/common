
import type { ClientContext as BasicClientContext } from '@owlmeans/client-context'
import type { ContextType as BasicContextType } from '@owlmeans/client-api'

import type { Config } from '@owlmeans/client-context'

export type BasicContext<C extends Config> = BasicContextType & BasicClientContext<C>
