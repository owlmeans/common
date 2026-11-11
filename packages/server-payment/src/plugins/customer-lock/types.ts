/** Serialized work per paygate customer, within this process. */
export interface CustomerLockHelper {
  /** Serialize the work on one customer of one paygate within this process (key `<paygate>:<customer id>`). */
  withCustomerLock: <T>(paygate: string, customerId: string | undefined, fn: () => Promise<T>) => Promise<T>
}
