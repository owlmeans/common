import { useMemo } from 'react'
import { useLocation, useNavigate as useNav } from 'react-router'
import type { Navigator } from './types.js'
import { ModuleOutcome } from '@owlmeans/module'
import { useContext } from './context.js'
import type { ClientModule } from '@owlmeans/client-module'

export const useNavigate = (): Navigator => {
  const context = useContext()
  const navigate = useNav()
  const location = useLocation()
  const navigator: Navigator = useMemo(() => {
    const navigator: Navigator = {
      _navigate: navigate,
      
      navigate: async (module, request) => {
        const [url, ok] = await module.call(request)

        if (ok === ModuleOutcome.Ok) {
          navigate(url, {
            state: {
              ...module.route.route, silent: request?.silent
            },
            replace: request?.replace ?? false
          })
        }
      },

      go: async (alias, request) =>
        navigator.navigate(context.module<ClientModule<string>>(alias), request),

      press: (alias, request) => () => {
        void navigator.go(alias, request)
      },

      back: async () => {
        navigate(-1)
      },

      pressBack: () => () => {  
        void navigator.back()
      },

      location: () => location
    }

    return navigator
  }, [navigate])

  return navigator
}
