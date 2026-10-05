/** Serialized work per paygate customer, within this process. */
export interface CustomerLockHelper {
  /** Serialize the work on one paygate customer within this process. */
  withCustomerLock: <T>(customerId: string | undefined, fn: () => Promise<T>) => Promise<T>
}
