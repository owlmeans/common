
export interface KeyPlugin {
  type: string
  random: () => Uint8Array
  sign: (data: Uint8Array, pk: Uint8Array) => Uint8Array
  verify: (data: Uint8Array, signature: Uint8Array, pub: Uint8Array) => boolean
  toPublic: (pk: Uint8Array) => Uint8Array
}
