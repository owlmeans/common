import { useMemo } from 'react'
import type { Navigator } from './types.js'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import { useContext } from './context.js'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

export const useNavigate = (): Navigator => {
  const context = useContext()
  const navigate = context.router().useNavigate()
  const location = context.router().useLocation()
  const navigator: Navigator = useMemo(() => {
    const navigator: Navigator = {
      _navigate: navigate,
      
      navigate: async (module, request) => {
        const [url, ok] = await module.call(request)

        if (ok === EntrypointOutcome.Ok) {
          if (url.startsWith('http')) {
            globalThis.location.href = url
          } else {
            navigate(url, {
              state: {
                ...module.route.route, silent: request?.silent
              },
              replace: request?.replace ?? false
            })
          }
        }
      },

      go: async (alias, request) =>
        navigator.navigate(context.entrypoint<ClientEntrypoint<string>>(alias), request),

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
