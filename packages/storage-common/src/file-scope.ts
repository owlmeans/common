import { FILE_SCOPE_SEGMENT_MAX_LENGTH, FILE_SCOPE_SEGMENT_PATTERN } from './consts.js'
import { FileScopeError } from './errors.js'
import type { FileScopeHelper } from './file-scope/types.js'
import type { FileScope } from './types.js'

export const createFileScopeHelper = (): FileScopeHelper => {
  const segment = new RegExp(FILE_SCOPE_SEGMENT_PATTERN)

  const isSegment = (value: unknown): value is string =>
    typeof value === 'string' && value.length <= FILE_SCOPE_SEGMENT_MAX_LENGTH && segment.test(value)

  const assert: FileScopeHelper['assert'] = (scope: unknown): asserts scope is FileScope => {
    if (scope == null || typeof scope !== 'object' || Array.isArray(scope)) {
      throw new FileScopeError('shape')
    }
    const { organization, project, purpose } = scope as Record<string, unknown>
    if (!isSegment(organization)) {
      throw new FileScopeError('organization')
    }
    if (project !== undefined && !isSegment(project)) {
      throw new FileScopeError('project')
    }
    if (!isSegment(purpose)) {
      throw new FileScopeError('purpose')
    }
  }

  const pathOf = (scope: FileScope): string => {
    assert(scope)
    return scope.project != null ? `${scope.organization}/${scope.project}/${scope.purpose}` : `${scope.organization}/${scope.purpose}`
  }

  const parse = (path: string): FileScope => {
    const parts = typeof path === 'string' ? path.split('/') : []
    if ((parts.length !== 2 && parts.length !== 3) || !parts.every(isSegment)) {
      throw new FileScopeError('path')
    }
    return parts.length === 3
      ? { organization: parts[0], project: parts[1], purpose: parts[2] }
      : { organization: parts[0], purpose: parts[1] }
  }

  return { pathOf, parse, isSegment, assert }
}

export const fileScopeHelper: FileScopeHelper = createFileScopeHelper()
