import { SubProject } from '../slot/consts.js'
import type { TargetPackageKind } from './types.js'

export const ROLES = new Set<string>(Object.values(SubProject))

export const KINDS = new Set<TargetPackageKind>(['library', 'bundle'])
