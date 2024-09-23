import { useEffect, useState, useRef, useId } from 'react'
import type { MutableRefObject, DependencyList } from 'react'
import type { UseValueParams } from './types.js'

const _complexValues: { [key: string]: any } = {}

export const useValue = <T>(
  loader: (cancel?: MutableRefObject<boolean>) => Promise<T>,
  def?: T | DependencyList | UseValueParams<T> | null,
  forceDefault?: boolean
): T | null => {
  const deps = Array.isArray(def)
    ? def : typeof def === 'object' && def != null && 'deps' in def
      ? def.deps ?? [] : []
  def = forceDefault === true
    ? def as T | null : Array.isArray(def)
      ? null : typeof def === 'object' && def != null && "default" in def
        ? def.default : def as T | null
  const id = useId()
  let [value, setValue] = useState<T>()
  const [prevDeps, setPrevDeps] = useState<DependencyList>(deps)

  const cancel = useRef(false)

  useEffect(() => {
    if (deps.some((dep, idx) => prevDeps[idx] !== dep)) {
      cancel.current = false
      setPrevDeps(deps)
    }
    void (async () => {
      if (await Promise.resolve(cancel.current)) {
        console.log('cancel use value')
        return
      }
      const value = await loader(cancel)
      if (typeof value === 'function') {
        _complexValues[id] = value
        setValue(id as any)
      } else {
        if (_complexValues[id] != null) {
          delete _complexValues[id]
        }
        setValue(value)
      }
    })()

    return () => {
      if (_complexValues[id] != null) {
        delete _complexValues[id]
        value = undefined
      }
      cancel.current = true
    }
  }, deps)

  return (
    typeof value === 'string' && value === id
      ? _complexValues[value]
      : value
  ) ?? def ?? null
}
