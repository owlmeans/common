
import { ResilientError } from '@owlmeans/error'

export class PaymentError extends ResilientError {
  public static override typeName: string = 'PaymentError'

  constructor(message: string = 'error') {
    super(PaymentError.typeName, `payment:${message}`)
  }
}

export class PaygateError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}Paygate`

  constructor(message: string = 'error') {
    super(`paygate:${message}`)
    this.type = PaygateError.typeName
  }
}

export class UnknownPaygate extends PaygateError {
  public static override typeName: string = `${PaygateError.typeName}Unknown`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownPaygate.typeName
  }
}

export class PaygateMappingError extends PaygateError {
  public static override typeName: string = `${PaygateError.typeName}Mapping`

  constructor(message: string = 'error') {
    super(`mapping:${message}`)
    this.type = PaygateMappingError.typeName
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

export class UnknownPlan extends ProductError {
  public static override typeName: string = `${ProductError.typeName}Plan`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownPlan.typeName
  }
}

export class PaymentIdentificationError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}Identification`

  constructor(message: string = 'error') {
    super(`identification:${message}`)
    this.type = PaymentIdentificationError.typeName
  }
}

ResilientError.registerErrorClass(PaymentError)
ResilientError.registerErrorClass(PaygateError)
ResilientError.registerErrorClass(UnknownPaygate)
ResilientError.registerErrorClass(PaygateMappingError)
ResilientError.registerErrorClass(ProductError)
ResilientError.registerErrorClass(UnknownProduct)
ResilientError.registerErrorClass(UnknownPlan)
ResilientError.registerErrorClass(PaymentIdentificationError)
