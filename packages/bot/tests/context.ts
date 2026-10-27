import Ajv from 'ajv'

/**
 * The one validator the suite shares, configured as the server's HTTP boundary validates a request
 * (`coerceTypes`, so a query string's `limit=50` is a number) but without stripping, so a refused
 * extra key is SEEN refused instead of silently dropped.
 */
export const ajv = new Ajv({ coerceTypes: true, allErrors: true, strict: false })

export const validatorOf = (schema: object): ((value: unknown) => boolean) => {
  const validate = ajv.compile(schema)
  return (value: unknown) => validate(structuredClone(value)) === true
}
