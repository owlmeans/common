import type { AmountCheckoutPolicy, CreateCheckoutResponse } from '@owlmeans/payment'

export type CheckoutResult = CreateCheckoutResponse
export interface AmountCheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy: AmountCheckoutPolicy
  pending?: boolean
  onConfirm: (amountMinor: number) => Promise<void> | void
}
