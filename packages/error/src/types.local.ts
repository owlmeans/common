import { CONVERTER_REGISTRY } from './consts.js'
import type { Converter } from './types.js'

/** The slot of the process-wide converter registry on `globalThis`. */
export interface ConverterHolder {
  [CONVERTER_REGISTRY]?: Converter[]
}
