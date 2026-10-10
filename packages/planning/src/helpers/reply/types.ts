/** Storage organization metadata is absent from planning HTTP and socket replies. */
export type PlanningReply<T> = T extends readonly (infer R)[] ? PlanningReply<R>[]
  : T extends object ? {
    [K in keyof T as K extends 'entityId' ? never : K]: K extends
      'items' | 'records' | 'card' | 'record' | 'transition' | 'bundle' | 'scope'
      ? PlanningReply<T[K]> : T[K]
  } : T

export interface PlanningReplyHelper {
  project: <T>(value: T) => PlanningReply<T>
  /** Restore the shared facade shape with empty, non-authoritative organization metadata. */
  hydrate: <T>(value: PlanningReply<T>) => T
}
