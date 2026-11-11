export const RESYNC_PAGE = 200

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The highest-ranked entitling subscription first, the newest on a tie. */
export const ENTITLING_SORT = [{ field: 'rank', order: 'desc' }, { field: 'createdAt', order: 'desc' }] as const
