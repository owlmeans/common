import type { CheckoutPlugin } from '../types.js'

/** A plugin that admitted an attempt, with the reservation it holds. */
export interface Admitted {
  plugin: CheckoutPlugin
  reservationId?: string
}
