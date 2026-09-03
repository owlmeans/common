
import { useContext } from 'react'
import { EntrypointContext } from './utils/index.js'
import type { EntrypointContextParams } from './types.js'

export const useEntrypoint = <T extends {} = {}>() => useContext(EntrypointContext) as EntrypointContextParams<T>
