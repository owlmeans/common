import { Layer } from '../consts'
import type { Service } from '../types'

export interface Services extends Record<string, Record<string, Service>> {}

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
