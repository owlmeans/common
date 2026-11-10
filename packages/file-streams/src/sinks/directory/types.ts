import type { FileSinkOptions } from '../types.js'
import type { PathLimits } from '../../utils/paths/types.js'

export interface DirectorySinkOptions extends FileSinkOptions, Partial<PathLimits> {
  /** Mode of created directories. Default `0o755`. */
  dirMode?: number
}
