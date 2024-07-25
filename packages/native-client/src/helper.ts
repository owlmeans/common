import { useMemo } from 'react'
import { useNavigate as useNav } from 'react-router-native'
import type { Navigator } from './types.js'
import { ModuleOutcome } from '@owlmeans/module'
import { useContext } from './context.js'
import type { ClientModule } from '@owlmeans/client-module'

export const useNavigate = (): Navigator => {
  const context = useContext()
  const navigate = useNav()
  const navigator: Navigator = useMemo(() => {
    const navigator: Navigator = {
      navigate: async (module, request) => {
        const [url, ok] = await module.call(request)
        console.log('Navigate to', url, ok)
        if (ok === ModuleOutcome.Ok) {
          navigate(url)
        }
      },

      go: async (alias, request) =>
        navigator.navigate(context.module<ClientModule<string>>(alias), request),

      press: (alias, request) => () => {
        void navigator.go(alias, request)
      }
    }

    return navigator
  }, [navigate])

  return navigator
}
