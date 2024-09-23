import type { ListCriteria, ListOptions, ListPager } from './types.js'

export const prepareListOptions = (defPageSize: number = 10, criteria?: ListOptions | ListCriteria, opts?: ListOptions): ListOptions => {
  if (opts == null) {
    if (criteria == null) {
      criteria = {}
      opts = {}
    } else if ('criteria' in criteria) {
      criteria = criteria.criteria as ListCriteria
      opts = { pager: criteria.pager as ListPager | undefined }
    } else if ('pager' in criteria) {
      opts = { pager: criteria.pager as ListPager | undefined }
      criteria = {}
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
