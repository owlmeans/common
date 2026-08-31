import type { ListCriteria, ListOptions, ListPager } from './types.js'

export const prepareListOptions = (defPageSize: number = 10, criteria?: ListOptions | ListCriteria, opts?: ListOptions): ListOptions => {
  if (opts == null) {
    if (criteria == null) {
      criteria = {}
      opts = {}
    } else if ('criteria' in criteria || 'pager' in criteria) {
      /**
       * Both keys have to be read off the original object before it's reassigned —
       * reading `pager` after narrowing to `.criteria` silently drops the pager.
       */
      const options = criteria as ListOptions
      opts = { pager: options.pager }
      criteria = (options.criteria ?? {}) as ListCriteria
    }
  }

  const size = (opts?.pager?.size ?? defPageSize)
  const pager: ListPager = {
    sort: opts?.pager?.sort,
    page: opts?.pager?.page ?? 0,
    size, total: 0
  }

  return { criteria: criteria as ListCriteria, pager }
}

export const filterObject = <T extends {}>(obj: T, keep?: string[]): T =>
  Object.entries(obj).reduce((obj, [key, value]) => {
    if (value == null && !keep?.includes(key)) {
      return obj
    }
    return { ...obj, [key]: value }
  }, {} as T)
