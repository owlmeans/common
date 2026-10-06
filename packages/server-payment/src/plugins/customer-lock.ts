import { Mutex } from 'async-mutex'
import type { CustomerLockHelper } from './customer-lock/types.js'

export const createCustomerLockHelper = (): CustomerLockHelper => {
  const customerMutex: Record<string, Mutex> = {}

  const withCustomerLock = async <T>(customerId: string | undefined, fn: () => Promise<T>): Promise<T> => {
    const key = customerId ?? ''
    const mutex = customerMutex[key] = customerMutex[key] ?? new Mutex()
    const release = await mutex.acquire()
    try {
      return await fn()
    } finally {
      release()
      if (!mutex.isLocked()) {
        delete customerMutex[key]
      }
    }
  }

  return { withCustomerLock }
}

/** The process's customer locks — one set shared by every caller. */
export const customerLockHelper = createCustomerLockHelper()
