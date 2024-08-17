
import { ResilientError } from '@owlmeans/error'

export class PaymentError extends ResilientError {
  public static override typeName: string = 'PaymentError'

  constructor(message: string = 'error') {
    super(PaymentError.typeName, `payment:${message}`)
  }
}

export class ProductError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}Product`

  constructor(message: string = 'error') {
    super(`product:${message}`)
    this.type = ProductError.typeName
  }
}

export class UnknownProduct extends ProductError {
  public static override typeName: string = `${ProductError.typeName}Unknown`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownProduct.typeName
  }
}

ResilientError.registerErrorClass(PaymentError)
ResilientError.registerErrorClass(ProductError)
ResilientError.registerErrorClass(UnknownProduct)
