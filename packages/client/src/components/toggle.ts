import { useMemo, useState } from 'react'
import type { Toggleable } from './types.js'

export const useToggle = (opened?: boolean): Toggleable => {
  if (opened === undefined) {
    opened = false
  }
  const [_opened, setOpened] = useState<boolean>(opened)
  return useMemo<Toggleable>(() => {
    const _handler: Toggleable = {
      opened: _opened === undefined ? false : _opened,
      set: opened => {
        setOpened(_handler.opened = opened)
      },
      open: () => { _handler.set(true) },
      close: () => { _handler.set(false) },
      toggle: () => { _handler.set(false) }
    }

    return _handler
  }, [])
}
