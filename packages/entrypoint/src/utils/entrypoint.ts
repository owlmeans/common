import { CommonEntrypoint } from '../types.js'

export const isEntrypoint = (obj: object): obj is CommonEntrypoint =>
  '_entrypoint' in obj || '_module' in obj
