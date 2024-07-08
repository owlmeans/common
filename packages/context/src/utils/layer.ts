import { Layer } from '../consts'

export interface InLayer<T> extends Record<Layer, Record<string, T>> { }

export const initializeLayer = <T>(inLayer: InLayer<T>, layer: Layer, id: string | undefined): string => {
  if (inLayer[layer] == null) {
    inLayer[layer] = {}
  }
  id = id ?? DEFAULT
  if (inLayer[layer][id] == null) {
    inLayer[layer][id] = {} as T
  }

  return id
}

export const DEFAULT = 'default'
