// import type { AuthToken } from '@owlmeans/auth'
import { DispatcherHOC } from '@owlmeans/client-auth'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export const Dispatcher = DispatcherHOC(({ provideToken }) => {
  const [query] = useSearchParams()

  useEffect(() => {
    const token = query.get('token')
    if (token != null) { 
      provideToken({ token }) 
    }
  }, [])

  return <>Loading...</>
})
