import { useMemo } from 'react'
import type { Navigator } from './types.js'
import { useContext } from './context.js'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

export const useNavigate = (): Navigator => {
  const context = useContext()
  const navigate = context.router().useNavigate()
  const location = context.router().useLocation()
  const navigator: Navigator = useMemo(() => {
    const navigator: Navigator = {
      _navigate: navigate,
      
      navigate: async (entrypoint, request) => {
        const url = await entrypoint.url(request)

        if (url.startsWith('http')) {
          globalThis.location.href = url
        } else {
          navigate(url, {
            state: {
              ...entrypoint.route.route, silent: request?.silent
            },
            replace: request?.replace ?? false
          })
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
