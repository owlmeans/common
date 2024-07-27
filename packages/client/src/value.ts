import { useEffect, useState, useRef } from 'react'
import type { MutableRefObject } from 'react'

export const useValue = <T>(
  loader: (cancel?: MutableRefObject<boolean>) => Promise<T>,
  def?: T
): T | null => {
  const [value, setValue] = useState<T>()

  const cancel = useRef(false)

  useEffect(() => {
    void (async () => {
      if (await Promise.resolve(cancel.current)) {
        return
      }
      setValue(await loader(cancel))
    })()

    return () => { 
      cancel.current = true 
    }
  }, [])

  return value ?? def ?? null
}
